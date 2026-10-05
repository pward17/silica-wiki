// Open comments, shown where they were left. Each one is a GitHub issue; this
// asks /api/comments for the open ones, finds the passage each was left on,
// highlights it, and puts the thread beside it in the right column, where a
// reader replies or resolves without leaving the page. When there is no right
// column, the thread opens as a panel under the passage instead.

import { plainText, renderMarkdown } from "./markdown"
import {
  COUNT,
  HIGHLIGHT,
  OpenComment,
  addCount,
  clearHighlight,
  insideDiagram,
  markDiagram,
  rangeForLines,
  rangeForQuote,
  setCount,
  wrapRange,
} from "./threads/anchor"

interface ReplyTarget {
  id: number
  who: string
  excerpt: string
}

interface ThreadEntry {
  id: number
  who: string
  when: string
  text: string
  replyTo?: ReplyTarget | null
}

interface Thread extends OpenComment {
  state: string
  thread: ThreadEntry[]
}

interface Anchored {
  comment: OpenComment
  marks: HTMLElement[]
}

const THREAD_PANEL = "wiki-thread-panel"
const INDEX_PANEL = "wiki-thread-index"
const RAIL_ID = "wiki-thread-rail"
const THREAD_GAP = 8
const THREAD_EDGE = 12
const RAIL_GAP = 12
const RAIL_MIN_WIDTH = 240
const VISIBLE_REPLIES = 3
// Past this many open comments the cards fold to a line each, and only the
// current one shows in full: a dozen open cards would push each other far
// from the passages they belong to.
const FOLD_ABOVE = 4
const SNIPPET_CHARS = 90

let anchored: Anchored[] = []
let unanchored: OpenComment[] = []
// The reader's own address, from the server, so their messages read as theirs.
let me = ""
const threads = new Map<number, Promise<Thread>>()
const cards = new Map<number, HTMLElement>()
let active: number | null = null
let layoutQueued = false

function marksOf(number: number): HTMLElement[] {
  return anchored.find((a) => a.comment.number === number)?.marks ?? []
}

// ---------- pieces shared by the panel and the rail ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function when(iso: string): string {
  const date = new Date(iso)
  return isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function speaker(who: string): string {
  return me !== "" && who === me ? `${who} (you)` : who
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    })
    return { ok: res.ok, data: await res.json() }
  } catch {
    return { ok: false, data: { error: "Could not reach the server." } }
  }
}

// One fetch per thread per page view, shared by whoever asks for it.
function loadThread(number: number): Promise<Thread> {
  let pending = threads.get(number)
  if (!pending) {
    pending = fetch(`/api/comments/${number}`, { credentials: "same-origin" }).then((res) => {
      if (!res.ok) throw new Error(`thread ${number}: ${res.status}`)
      return res.json()
    })
    threads.set(number, pending)
  }
  return pending
}

// Long text folds to a few lines with a control to unfold it. The control only
// appears when something is hidden, which needs a layout pass, so it is
// decided after the node is in the document.
function clampable(text: string, className: string): HTMLElement {
  const wrap = el("div", "wiki-clamp-wrap")
  const body = el("div", `${className} wiki-clamp`)
  body.appendChild(renderMarkdown(text))
  const more = el("button", "wiki-more", "Read more")
  more.type = "button"
  more.hidden = true
  more.addEventListener("click", () => {
    const folded = body.classList.toggle("wiki-clamp")
    more.textContent = folded ? "Read more" : "Show less"
    queueLayout()
  })
  wrap.append(body, more)
  requestAnimationFrame(() => {
    more.hidden = body.scrollHeight <= body.clientHeight + 1
  })
  return wrap
}

function entryNode(
  entry: ThreadEntry,
  onReply: ((entry: ThreadEntry) => void) | null,
  compact: boolean,
): HTMLElement {
  const mine = me !== "" && entry.who === me
  const node = el("div", mine ? "wiki-thread-entry wiki-thread-mine" : "wiki-thread-entry")
  node.dataset.entry = String(entry.id)
  const head = el("div", "wiki-thread-who")
  head.appendChild(el("strong", undefined, speaker(entry.who)))
  const right = el("span", "wiki-thread-meta")
  if (onReply) {
    const reply = el("button", "wiki-thread-reply", "Reply")
    reply.type = "button"
    reply.addEventListener("click", () => onReply(entry))
    right.appendChild(reply)
  }
  right.appendChild(el("span", "wiki-thread-when", when(entry.when)))
  head.appendChild(right)
  node.appendChild(head)
  if (entry.replyTo) {
    node.appendChild(
      el("div", "wiki-thread-quote", `${entry.replyTo.who}: ${plainText(entry.replyTo.excerpt)}`),
    )
  }
  if (compact) {
    node.appendChild(clampable(entry.text, "wiki-thread-text"))
  } else {
    const body = el("div", "wiki-thread-text")
    body.appendChild(renderMarkdown(entry.text))
    node.appendChild(body)
  }
  return node
}

interface Controls {
  root: HTMLElement
  setTarget: (entry: ThreadEntry | null) => void
  textarea: HTMLTextAreaElement
}

// The reply box, its "replying to" chip, and the Reply and Resolve buttons,
// wired to the server. `onReply` gets each new entry to render; `onResolved`
// runs after the issue is closed.
function controls(
  comment: OpenComment,
  opts: { compact: boolean; onReply: (entry: ThreadEntry) => void; onResolved: () => void },
): Controls {
  const root = el(
    "div",
    opts.compact ? "wiki-thread-compose wiki-thread-compact" : "wiki-thread-compose",
  )
  let target: ThreadEntry | null = null

  const chip = el("div", "wiki-thread-target")
  chip.hidden = true
  const textarea = el("textarea", "wiki-comment-text")
  textarea.rows = opts.compact ? 1 : 3
  textarea.placeholder = "Reply"
  const actions = el("div", "wiki-comment-actions")
  const status = el("span", "wiki-comment-status")
  const buttons = el("span", "wiki-thread-buttons")
  const resolve = el("button", "wiki-thread-resolve", "Resolve")
  resolve.type = "button"
  const reply = el("button", "wiki-comment-send", "Reply")
  reply.type = "button"
  buttons.append(resolve, reply)
  actions.append(status, buttons)
  root.append(chip, textarea, actions)

  const setTarget = (entry: ThreadEntry | null) => {
    target = entry
    chip.textContent = ""
    chip.hidden = !entry
    if (entry) {
      chip.appendChild(
        el(
          "span",
          undefined,
          `Replying to ${entry.who}: ${entry.text.split("\n")[0].slice(0, 60)}`,
        ),
      )
      const clear = el("button", "wiki-comment-close", "×")
      clear.type = "button"
      clear.setAttribute("aria-label", "Reply to the thread instead")
      clear.addEventListener("click", () => setTarget(null))
      chip.appendChild(clear)
      open()
      textarea.focus()
    }
    queueLayout()
  }

  // Compact boxes start as one line and grow when the reader means it.
  const open = () => {
    if (!opts.compact) return
    root.classList.add("wiki-thread-open")
    textarea.rows = 3
    queueLayout()
  }
  const close = () => {
    if (!opts.compact || textarea.value.trim() || target) return
    root.classList.remove("wiki-thread-open")
    textarea.rows = 1
    queueLayout()
  }
  textarea.addEventListener("focus", open)
  textarea.addEventListener("blur", () => setTimeout(close, 150))

  const send = async () => {
    const text = textarea.value.trim()
    if (!text) {
      status.textContent = "Write something first."
      return
    }
    reply.disabled = true
    status.textContent = "Sending..."
    const result = await post(`/api/comments/${comment.number}/reply`, {
      text,
      replyTo: target ? target.id : null,
    })
    reply.disabled = false
    if (!result.ok) {
      status.textContent = result.data.error || "Could not send."
      return
    }
    status.textContent = ""
    textarea.value = ""
    comment.replies += 1
    setCount(comment.number, 1 + comment.replies)
    setTarget(null)
    opts.onReply(result.data as ThreadEntry)
    close()
  }

  const finish = async () => {
    resolve.disabled = true
    status.textContent = "Resolving..."
    const result = await post(`/api/comments/${comment.number}/resolve`, {})
    if (!result.ok) {
      resolve.disabled = false
      status.textContent = result.data.error || "Could not resolve."
      return
    }
    clearHighlight(comment.number)
    anchored = anchored.filter((a) => a.comment.number !== comment.number)
    unanchored = unanchored.filter((c) => c.number !== comment.number)
    threads.delete(comment.number)
    opts.onResolved()
    renderChip()
  }

  reply.addEventListener("click", send)
  resolve.addEventListener("click", finish)
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send()
    if (e.key === "Escape") {
      closeThread()
      textarea.blur()
    }
  })

  return { root, setTarget, textarea }
}

// ---------- the panel, for pages without a right column ----------

function closeThread() {
  document.getElementById(THREAD_PANEL)?.remove()
}

function placeThread(panel: HTMLElement, rect: DOMRect) {
  const maxLeft = document.documentElement.clientWidth - panel.offsetWidth - THREAD_EDGE
  const left = Math.max(THREAD_EDGE, Math.min(rect.left, maxLeft))
  const below = rect.bottom + THREAD_GAP
  const fitsBelow = below + panel.offsetHeight <= window.innerHeight - THREAD_EDGE
  const top = fitsBelow ? below : Math.max(THREAD_EDGE, rect.top - panel.offsetHeight - THREAD_GAP)
  panel.style.left = `${left + window.scrollX}px`
  panel.style.top = `${top + window.scrollY}px`
}

function openThread(comment: OpenComment, rect: DOMRect) {
  document.dispatchEvent(new CustomEvent("wiki-panel-open", { detail: THREAD_PANEL }))
  closeThread()

  const panel = el("div")
  panel.id = THREAD_PANEL
  const inner = el("div", "wiki-comment-inner")
  panel.appendChild(inner)

  const head = el("div", "wiki-comment-head")
  const link = el("a", "wiki-thread-link", "GitHub")
  link.href = comment.url
  link.target = "_blank"
  link.rel = "noopener"
  const close = el("button", "wiki-comment-close", "×")
  close.type = "button"
  close.setAttribute("aria-label", "Close")
  head.append(el("strong", undefined, `Comment #${comment.number}`), link, close)
  inner.appendChild(head)

  const list = el("div", "wiki-thread-list")
  const box = controls(comment, {
    compact: false,
    onReply: (entry) => {
      list.appendChild(entryNode(entry, box.setTarget, false))
      placeThread(panel, rect)
    },
    onResolved: closeThread,
  })
  const opening: ThreadEntry = {
    id: 0,
    who: comment.author,
    when: comment.created,
    text: comment.text,
  }
  list.appendChild(entryNode(opening, box.setTarget, false))
  const loading = el("div", "wiki-thread-loading", comment.replies > 0 ? "Loading replies..." : "")
  list.appendChild(loading)
  inner.append(list, box.root)

  document.body.appendChild(panel)
  placeThread(panel, rect)
  close.addEventListener("click", closeThread)

  loadThread(comment.number)
    .then((thread) => {
      loading.remove()
      for (const entry of thread.thread || []) {
        list.appendChild(entryNode(entry, box.setTarget, false))
      }
      placeThread(panel, rect)
    })
    .catch(() => {
      loading.textContent = "Could not load the replies."
    })
  box.textarea.focus()
}

// ---------- the rail: threads beside their passages ----------

// The right column of the desktop layout, when it is there and wide enough.
function railColumn(): DOMRect | null {
  if (!window.matchMedia("(min-width: 1200px)").matches) return null
  const column = document.querySelector<HTMLElement>(".sidebar.right")
  if (!column) return null
  const rect = column.getBoundingClientRect()
  return rect.width >= RAIL_MIN_WIDTH ? rect : null
}

function railElement(): HTMLElement {
  let rail = document.getElementById(RAIL_ID)
  if (!rail) {
    rail = el("div")
    rail.id = RAIL_ID
    document.body.appendChild(rail)
    new ResizeObserver(() => queueLayout()).observe(rail)
  }
  return rail
}

// The column's own content (the graph) sits at its top, in the page's flow;
// cards start below it. In reader mode the column is hidden, so nothing to
// keep clear of. Page coordinates.
function railFloor(): number {
  if (document.documentElement.getAttribute("reader-mode") === "on") return 0
  const column = document.querySelector<HTMLElement>(".sidebar.right")
  if (!column) return 0
  let bottom = 0
  for (const child of Array.from(column.children)) {
    const rect = child.getBoundingClientRect()
    if (rect.height > 0) bottom = Math.max(bottom, rect.bottom + window.scrollY)
  }
  return bottom > 0 ? bottom + RAIL_GAP : 0
}

function cardFor(comment: OpenComment, isAnchored: boolean): HTMLElement {
  const card = el("div", "wiki-rail-card")
  card.dataset.issue = String(comment.number)
  if (me !== "" && comment.author === me) card.classList.add("wiki-rail-mine")

  // The one-line form: who, how much of a thread, and the first words.
  const summary = el("div", "wiki-rail-summary")
  const summaryHead = el("div", "wiki-thread-who")
  summaryHead.appendChild(el("strong", undefined, speaker(comment.author)))
  const summaryMeta = el("span", "wiki-thread-meta")
  const repliesBadge = el("span", "wiki-rail-replies")
  const showReplies = () => {
    repliesBadge.textContent =
      comment.replies > 0 ? `${comment.replies} ${comment.replies === 1 ? "reply" : "replies"}` : ""
    repliesBadge.hidden = comment.replies === 0
  }
  showReplies()
  summaryMeta.append(
    el("span", "wiki-thread-when", `#${comment.number}`),
    repliesBadge,
    el("span", "wiki-thread-when", when(comment.created)),
  )
  summaryHead.appendChild(summaryMeta)
  const snippet = plainText(comment.text)
  summary.append(
    summaryHead,
    el(
      "div",
      "wiki-rail-snippet",
      snippet.length > SNIPPET_CHARS ? `${snippet.slice(0, SNIPPET_CHARS - 1)}…` : snippet,
    ),
  )
  summary.title = snippet
  card.appendChild(summary)

  // A passage that has moved on, or a note on the page as a whole, has no
  // highlight to point at, so the card says what it was about.
  if (!isAnchored) {
    card.appendChild(
      el(
        "div",
        "wiki-rail-quote",
        comment.quote
          ? `"${comment.quote.slice(0, 120)}${comment.quote.length > 120 ? "…" : ""}" (passage has changed)`
          : "On the page as a whole",
      ),
    )
  }

  const list = el("div", "wiki-thread-list wiki-rail-list")
  const box = controls(comment, {
    compact: true,
    onReply: (entry) => {
      list.appendChild(entryNode(entry, box.setTarget, true))
      showReplies()
      queueLayout()
    },
    onResolved: () => {
      card.remove()
      cards.delete(comment.number)
      if (active === comment.number) active = null
      queueLayout()
    },
  })
  // The opening comment is the card's first row, and carries the issue link.
  const opening: ThreadEntry = {
    id: 0,
    who: comment.author,
    when: comment.created,
    text: comment.text,
  }
  const first = entryNode(opening, box.setTarget, true)
  const link = el("a", "wiki-thread-link", `#${comment.number}`)
  link.href = comment.url
  link.target = "_blank"
  link.rel = "noopener"
  first.querySelector(".wiki-thread-meta")!.prepend(link)
  list.appendChild(first)
  const loading = el("div", "wiki-thread-loading", comment.replies > 0 ? "Loading replies..." : "")
  list.appendChild(loading)
  card.append(list, box.root)

  loadThread(comment.number)
    .then((thread) => {
      loading.remove()
      const replies = thread.thread || []
      // Long threads fold: the last few show, the rest wait behind one control.
      const hidden = replies.slice(0, Math.max(0, replies.length - VISIBLE_REPLIES))
      const shown = replies.slice(hidden.length)
      if (hidden.length > 0) {
        const earlier = el(
          "button",
          "wiki-more wiki-rail-earlier",
          `Show ${hidden.length} earlier ${hidden.length === 1 ? "reply" : "replies"}`,
        )
        earlier.type = "button"
        earlier.addEventListener("click", () => {
          const frag = document.createDocumentFragment()
          for (const entry of hidden) frag.appendChild(entryNode(entry, box.setTarget, true))
          earlier.replaceWith(frag)
          queueLayout()
        })
        list.appendChild(earlier)
      }
      for (const entry of shown) list.appendChild(entryNode(entry, box.setTarget, true))
      queueLayout()
    })
    .catch(() => {
      loading.textContent = "Could not load the replies."
    })

  // Clicking the card itself (not a control inside it) shows the passage.
  card.addEventListener("click", (e) => {
    const target = e.target as HTMLElement
    if (target.closest("button, a, textarea, .wiki-thread-target")) return
    activate(comment.number, "mark")
  })
  return card
}

function addCard(comment: OpenComment, isAnchored: boolean) {
  const card = cardFor(comment, isAnchored)
  cards.set(comment.number, card)
  railElement().appendChild(card)
  queueLayout()
}

// Where a card wants to be, in page coordinates: level with its passage. A
// card with no passage goes after the article, so it never takes the room a
// placed card needs near the top.
function desiredTop(number: number): number {
  const marks = marksOf(number)
  if (marks.length > 0 && document.contains(marks[0])) {
    return marks[0].getBoundingClientRect().top + window.scrollY
  }
  const article = document.querySelector("article")
  return article ? article.getBoundingClientRect().bottom + window.scrollY : 0
}

function queueLayout() {
  if (layoutQueued) return
  layoutQueued = true
  requestAnimationFrame(() => {
    layoutQueued = false
    layoutRail()
  })
}

// Cards sit level with their passages, in page coordinates, so they scroll
// with the text and otherwise stay put. They never overlap: lower ones move
// down. The current card keeps its exact place and pushes the others away.
// This runs when cards appear, change size, or the window resizes; never on
// scroll.
function layoutRail() {
  const rail = document.getElementById(RAIL_ID)
  if (!rail) return
  const column = railColumn()
  if (!column || cards.size === 0) {
    rail.hidden = true
    return
  }
  rail.hidden = false
  rail.style.left = `${column.left + window.scrollX + 8}px`
  rail.style.width = `${column.width - 24}px`
  const floor = railFloor()

  const ordered = [...cards.entries()]
    .map(([number, card]) => ({ number, card, wanted: desiredTop(number) }))
    .sort((a, b) => a.wanted - b.wanted || a.number - b.number)
  const fold = cards.size > FOLD_ABOVE
  for (const o of ordered) {
    o.card.classList.toggle("wiki-rail-folded", fold && o.number !== active)
  }
  const heights = ordered.map((o) => o.card.offsetHeight)
  const tops = ordered.map((o) => Math.max(o.wanted, floor))
  const stackDown = (from: number) => {
    for (let i = from; i < ordered.length; i++) {
      tops[i] = Math.max(tops[i], tops[i - 1] + heights[i - 1] + RAIL_GAP)
    }
  }

  // Everything stacks downward from the floor first: a card sits at its
  // passage unless the one above it is in the way.
  stackDown(1)

  // Then the current card takes its exact place, and the cards above it are
  // pulled up only as far as needed to make room. Nothing goes above the
  // floor; if that would be needed, the whole stack slides down together.
  const pivot = ordered.findIndex((o) => o.number === active)
  if (pivot >= 0) {
    tops[pivot] = Math.max(ordered[pivot].wanted, floor)
    for (let i = pivot - 1; i >= 0; i--) {
      tops[i] = Math.min(tops[i], tops[i + 1] - RAIL_GAP - heights[i])
    }
    // If the ones above would end up over the floor, the current card and
    // its stack give way by exactly that much; cards below only move if the
    // stack then reaches them.
    const minTop = Math.min(...tops.slice(0, pivot + 1))
    if (minTop < floor) {
      for (let i = 0; i <= pivot; i++) tops[i] += floor - minTop
    }
    stackDown(pivot + 1)
  }
  ordered.forEach((o, i) => {
    o.card.style.top = `${tops[i]}px`
    o.card.classList.toggle("wiki-rail-active", o.number === active)
  })
  for (const mark of document.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT}`)) {
    mark.classList.toggle("wiki-thread-active", Number(mark.dataset.issue) === active)
  }
  // Folded text decides whether it needs a control only once it has a size.
  for (const wrap of rail.querySelectorAll<HTMLElement>(".wiki-clamp-wrap")) {
    const body = wrap.firstElementChild as HTMLElement
    const more = wrap.lastElementChild as HTMLElement
    if (body.classList.contains("wiki-clamp"))
      more.hidden = body.scrollHeight <= body.clientHeight + 1
  }
}

function flash(marks: HTMLElement[]) {
  for (const mark of marks) mark.classList.add("wiki-thread-flash")
  setTimeout(() => marks.forEach((mark) => mark.classList.remove("wiki-thread-flash")), 1200)
}

// Makes one thread the current one: its card lines up with its passage. From
// a card the passage scrolls into view.
function activate(number: number, scrollTo: "mark" | "card") {
  active = number
  queueLayout()
  const marks = marksOf(number)
  if (scrollTo === "mark" && marks.length > 0) {
    marks[0].scrollIntoView({ block: "center", behavior: "smooth" })
    flash(marks)
  }
}

// ---------- the chip in the status line ----------

function renderChip() {
  document.querySelector(".wiki-thread-chip")?.remove()
  document.getElementById(INDEX_PANEL)?.remove()
  const footer = document.querySelector<HTMLElement>(".wiki-comment-footer")
  const total = anchored.length + unanchored.length
  if (!footer || total === 0) return

  const chip = el("button", "wiki-thread-chip", `${total} open comment${total === 1 ? "" : "s"}`)
  chip.type = "button"
  chip.addEventListener("click", () => openIndex(chip))
  footer.appendChild(chip)
}

function openIndex(chip: HTMLElement) {
  document.dispatchEvent(new CustomEvent("wiki-panel-open", { detail: INDEX_PANEL }))
  closeThread()
  document.getElementById(INDEX_PANEL)?.remove()

  const panel = el("div")
  panel.id = INDEX_PANEL
  const inner = el("div", "wiki-comment-inner")
  panel.appendChild(inner)
  const head = el("div", "wiki-comment-head")
  head.appendChild(el("strong", undefined, "Open comments"))
  const close = el("button", "wiki-comment-close", "×")
  close.type = "button"
  head.appendChild(close)
  inner.appendChild(head)

  const list = el("div", "wiki-thread-list")
  const row = (comment: OpenComment, note: string, onClick: () => void) => {
    const item = el("button", "wiki-thread-row")
    item.type = "button"
    item.appendChild(el("strong", undefined, `#${comment.number}`))
    item.appendChild(
      el("span", undefined, ` ${speaker(comment.author)}: ${plainText(comment.text).slice(0, 70)}`),
    )
    if (note) item.appendChild(el("em", "wiki-thread-note", note))
    item.addEventListener("click", onClick)
    list.appendChild(item)
  }
  const show = (comment: OpenComment, rect: () => DOMRect) => {
    panel.remove()
    if (railColumn() && cards.has(comment.number)) {
      activate(comment.number, "mark")
    } else {
      openThread(comment, rect())
    }
  }
  for (const { comment, marks } of anchored) {
    row(comment, "", () => {
      marks[0].scrollIntoView({ block: "center" })
      show(comment, () => marks[0].getBoundingClientRect())
    })
  }
  for (const comment of unanchored) {
    row(comment, comment.quote ? "passage has changed" : "whole page", () =>
      show(comment, () => chip.getBoundingClientRect()),
    )
  }
  inner.appendChild(list)
  document.body.appendChild(panel)
  placeThread(panel, chip.getBoundingClientRect())
  close.addEventListener("click", () => panel.remove())
}

// ---------- wiring ----------

// Highlights one comment on the page, or files it under the chip when its
// passage cannot be found, and gives it a card in the rail either way.
function place(article: HTMLElement, pageCommit: string, comment: OpenComment) {
  const nearLine = Number((comment.lines || "").split("-")[0]) || 0
  let range = comment.quote ? rangeForQuote(article, comment.quote, nearLine) : null
  if (!range && comment.lines && comment.commit && comment.commit === pageCommit) {
    range = rangeForLines(article, comment.lines)
  }
  const diagram = range ? insideDiagram(range.startContainer) : null
  const marks = range
    ? diagram
      ? markDiagram(diagram, comment)
      : wrapRange(range, comment.number)
    : []
  if (marks.length > 0) {
    addCount(marks, comment)
    anchored.push({ comment, marks })
  } else {
    unanchored.push(comment)
  }
  addCard(comment, marks.length > 0)
}

// Diagrams render after the page, from a script fetched on demand, so a quote
// that lives in one is not there to find on the first pass. One more pass a
// moment later catches those.
function retryLater(article: HTMLElement, pageCommit: string, attempt = 0) {
  if (!document.querySelector("code.mermaid") || attempt >= 4) return
  setTimeout(() => {
    if (document.querySelector("article") !== article) return
    let changed = false
    for (const comment of unanchored.filter((c) => c.quote)) {
      const nearLine = Number((comment.lines || "").split("-")[0]) || 0
      if (!rangeForQuote(article, comment.quote, nearLine)) continue
      unanchored = unanchored.filter((c) => c !== comment)
      cards.get(comment.number)?.remove()
      cards.delete(comment.number)
      place(article, pageCommit, comment)
      changed = true
    }
    if (changed) {
      renderChip()
      queueLayout()
    }
    // Keep looking while a diagram is still undrawn and something is unplaced.
    if (unanchored.some((c) => c.quote) && document.querySelector("code.mermaid:not(:has(svg))")) {
      retryLater(article, pageCommit, attempt + 1)
    }
  }, 2500)
}

function reset() {
  closeThread()
  document.getElementById(INDEX_PANEL)?.remove()
  document.getElementById(RAIL_ID)?.remove()
  anchored = []
  unanchored = []
  cards.clear()
  threads.clear()
  active = null
}

async function showThreads() {
  const article = document.querySelector<HTMLElement>("article")
  const footer = document.querySelector<HTMLElement>(".wiki-comment-footer")
  if (!article || !footer) return
  const pagePath = footer.dataset.pagePath
  const pageCommit = footer.dataset.pageCommit || ""
  if (!pagePath) return

  let comments: OpenComment[]
  try {
    const res = await fetch("/api/comments", { credentials: "same-origin" })
    if (!res.ok) return
    const data = await res.json()
    comments = data.comments || []
    // Comments work on this site: show the controls.
    footer.hidden = false
    me = data.me || ""
  } catch {
    return
  }
  // The reader may have moved on while the list was loading.
  if (document.querySelector("article") !== article) return

  for (const comment of comments) {
    if (comment.path === pagePath) place(article, pageCommit, comment)
  }
  renderChip()
  queueLayout()
  retryLater(article, pageCommit)
  // Diagrams and images arrive after the text and push it down; cards follow.
  new ResizeObserver(() => queueLayout()).observe(article)
}

function onFiled(e: Event) {
  const comment = (e as CustomEvent).detail as OpenComment
  const article = document.querySelector<HTMLElement>("article")
  const footer = document.querySelector<HTMLElement>(".wiki-comment-footer")
  if (!article || !footer || comment.path !== footer.dataset.pagePath) return
  place(article, footer.dataset.pageCommit || "", comment)
  renderChip()
  if (railColumn()) activate(comment.number, "card")
}

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target || !document.contains(target)) return
  const hit = target.closest<HTMLElement>(`mark.${HIGHLIGHT}, .${COUNT}`)
  if (hit) {
    const number = Number(hit.dataset.issue)
    const found = anchored.find((a) => a.comment.number === number)
    if (!found) return
    e.preventDefault()
    if (railColumn() && cards.has(number)) activate(number, "card")
    else openThread(found.comment, found.marks[0].getBoundingClientRect())
    return
  }
  // A click anywhere else closes the floating panels.
  for (const id of [THREAD_PANEL, INDEX_PANEL]) {
    const panel = document.getElementById(id)
    if (panel && !panel.contains(target) && !target.closest(".wiki-thread-chip")) panel.remove()
  }
}

document.addEventListener("click", onClick)
document.addEventListener("wiki-comment-filed", onFiled)
window.addEventListener("resize", () => queueLayout())
document.addEventListener("wiki-panel-open", (e) => {
  const opener = (e as CustomEvent).detail
  if (opener !== THREAD_PANEL) closeThread()
  if (opener !== INDEX_PANEL) document.getElementById(INDEX_PANEL)?.remove()
})

document.addEventListener("nav", () => {
  reset()
  showThreads()
})
