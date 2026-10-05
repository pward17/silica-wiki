// Select text on a page, leave a comment, and it becomes a GitHub issue.
// The reader is already authenticated by Cloudflare Access, so there is no
// login step here and no identity in the payload: functions/api/comment.js
// takes the email from Access.

const BUTTON_ID = "wiki-comment-button"
// A speech bubble with a plus: leave a new comment here.
const COMMENT_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/></svg>'
const PANEL_ID = "wiki-comment-panel"
const MARK_CLASS = "wiki-comment-mark"
const GAP = 8
const EDGE = 12

// Kept so the panel and the highlight can follow the passage when the window
// changes size. A Range stays valid as long as nothing rewrites the article.
let anchoredRange: Range | null = null

// Both come from the page's own frontmatter and file path, printed into the
// markup by PageComments. The URL cannot give the first (a folder page lives at
// index.md) and document.title cannot give the second (browser extensions
// rewrite it).
function pageSource(): { path: string; title: string; commit: string } {
  const footer = document.querySelector<HTMLElement>(".wiki-comment-footer")
  const path = footer?.dataset.pagePath
  const title = footer?.dataset.pageTitle
  return {
    path: path || `content/${window.location.pathname.replace(/^\/+|\/+$/g, "") || "index"}.md`,
    title: title || document.title,
    commit: footer?.dataset.pageCommit || "",
  }
}

// Every block carries the markdown line it was built from, so a selection can
// name the lines to edit rather than a passage somebody has to search for.
function lineRange(range: Range | null): string {
  if (!range) return ""
  const block = (node: Node | null): HTMLElement | null => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement
    return el?.closest<HTMLElement>("[data-line]") ?? null
  }
  const first = block(range.startContainer)
  if (!first) return ""
  const last = block(range.endContainer) ?? first
  const from = Number(first.dataset.line)
  const to = Number(last.dataset.lineEnd || last.dataset.line)
  if (!from) return ""
  return to && to !== from ? `${from}-${to}` : `${from}`
}

function removeFloating() {
  document.getElementById(BUTTON_ID)?.remove()
}

function clearMarks() {
  document.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => el.remove())
}

function closePanel() {
  document.getElementById(PANEL_ID)?.remove()
  clearMarks()
  anchoredRange = null
}

// The passage stays visible while the panel is open. Overlay rectangles do that
// without touching the article DOM, which would break anchors and popovers.
function paintMarks(range: Range) {
  clearMarks()
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width <= 0 || rect.height <= 0) continue
    const mark = document.createElement("div")
    mark.className = MARK_CLASS
    mark.style.top = `${rect.top + window.scrollY}px`
    mark.style.left = `${rect.left + window.scrollX}px`
    mark.style.width = `${rect.width}px`
    mark.style.height = `${rect.height}px`
    document.body.appendChild(mark)
  }
}

function placePanel(panel: HTMLElement, range: Range) {
  const rect = range.getBoundingClientRect()
  const maxLeft = document.documentElement.clientWidth - panel.offsetWidth - EDGE
  const left = Math.max(EDGE, Math.min(rect.left, maxLeft))
  // Under the passage, unless the panel would hang off the bottom of the window.
  const below = rect.bottom + GAP
  const fitsBelow = below + panel.offsetHeight <= window.innerHeight - EDGE
  const top = fitsBelow ? below : Math.max(EDGE, rect.top - panel.offsetHeight - GAP)
  panel.style.left = `${left + window.scrollX}px`
  panel.style.top = `${top + window.scrollY}px`
}

function openPanel(quote: string, range: Range | null) {
  // One panel at a time: this closes any open thread, and opening a thread
  // closes this.
  document.dispatchEvent(new CustomEvent("wiki-panel-open", { detail: PANEL_ID }))
  closePanel()
  removeFloating()

  const panel = document.createElement("div")
  panel.id = PANEL_ID
  if (range) panel.classList.add("wiki-comment-anchored")
  panel.innerHTML = `
    <div class="wiki-comment-inner">
      <div class="wiki-comment-head">
        <strong>Leave a comment</strong>
        <button type="button" class="wiki-comment-close" aria-label="Close">&times;</button>
      </div>
      ${quote ? `<blockquote class="wiki-comment-quote"></blockquote>` : ""}
      <textarea class="wiki-comment-text" rows="4" placeholder="What is wrong, missing, or unclear?"></textarea>
      <div class="wiki-comment-actions">
        <span class="wiki-comment-status"></span>
        <span class="wiki-thread-buttons">
          <button type="button" class="wiki-comment-send">Send</button>
        </span>
      </div>
    </div>
  `
  document.body.appendChild(panel)

  const quoteEl = panel.querySelector<HTMLElement>(".wiki-comment-quote")
  if (quoteEl) quoteEl.textContent = quote

  if (range) {
    anchoredRange = range
    paintMarks(range)
    placePanel(panel, range)
    // Our own highlight replaces the browser's, which would otherwise disappear
    // the moment the textarea takes focus.
    window.getSelection()?.removeAllRanges()
  }

  const textarea = panel.querySelector<HTMLTextAreaElement>(".wiki-comment-text")!
  const status = panel.querySelector<HTMLElement>(".wiki-comment-status")!
  const send = panel.querySelector<HTMLButtonElement>(".wiki-comment-send")!
  textarea.focus()
  panel.querySelector(".wiki-comment-close")!.addEventListener("click", closePanel)

  const source = pageSource()
  const lines = lineRange(range)

  const submit = async () => {
    const comment = textarea.value.trim()
    if (!comment) {
      status.textContent = "Write something first."
      return
    }
    send.disabled = true
    status.textContent = "Sending..."
    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          comment,
          quote,
          path: source.path,
          title: source.title,
          commit: source.commit,
          lines,
          url: window.location.href,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        status.textContent = data.error || "Could not send."
        send.disabled = false
        return
      }
      panel.querySelector(".wiki-comment-inner")!.innerHTML =
        `<p class="wiki-comment-done">Filed as <a href="${data.url}" target="_blank" rel="noopener">comment #${data.number}</a>.</p>`
      panel.classList.add("wiki-comment-filed")
      if (anchoredRange) placePanel(panel, anchoredRange)
      setTimeout(closePanel, 2500)
      // Hand the new comment to the thread layer so it shows up at once.
      document.dispatchEvent(
        new CustomEvent("wiki-comment-filed", {
          detail: {
            number: data.number,
            url: data.url,
            path: source.path,
            lines,
            commit: source.commit,
            quote,
            author: data.author || "",
            created: new Date().toISOString(),
            text: comment,
            replies: 0,
          },
        }),
      )
    } catch {
      status.textContent = "Could not reach the server."
      send.disabled = false
    }
  }

  send.addEventListener("click", submit)
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit()
    if (e.key === "Escape") closePanel()
  })
}

function showFloatingButton(selection: Selection) {
  removeFloating()
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const quote = selection.toString().trim()
  // Cloned, because the live selection is gone by the time the panel opens.
  const anchor = range.cloneRange()

  const button = document.createElement("button")
  button.id = BUTTON_ID
  button.type = "button"
  button.title = "Comment on this"
  button.setAttribute("aria-label", "Comment on this")
  button.innerHTML = COMMENT_ICON
  button.style.top = `${rect.bottom + window.scrollY + 6}px`
  button.style.left = `${Math.max(EDGE, rect.left) + window.scrollX}px`
  button.addEventListener("mousedown", (e) => {
    // mousedown, because clicking clears the selection before click fires.
    e.preventDefault()
    openPanel(quote, anchor)
  })
  document.body.appendChild(button)
}

// The thread script unhides the footer once /api/comments answers; until then
// this site has no working comments and a selection offers nothing.
function commentsEnabled(): boolean {
  return Boolean(document.querySelector(".wiki-comment-footer:not([hidden])"))
}

function onSelectionChange() {
  if (document.getElementById(PANEL_ID)) return
  if (!commentsEnabled()) return
  const article = document.querySelector("article")
  const selection = window.getSelection()
  if (!article || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    removeFloating()
    return
  }
  const anchor = selection.anchorNode
  if (!anchor || !article.contains(anchor) || selection.toString().trim().length < 3) {
    removeFloating()
    return
  }
  showFloatingButton(selection)
}

function onResize() {
  const panel = document.getElementById(PANEL_ID)
  if (!panel || !anchoredRange) return
  paintMarks(anchoredRange)
  placePanel(panel, anchoredRange)
}

// A click outside the panel closes it, unless a draft is sitting in it: a
// confirmation or an empty box should never outlive the reader's attention,
// and a half-written comment should never vanish under a stray click.
function onDocumentClick(e: MouseEvent) {
  const panel = document.getElementById(PANEL_ID)
  const target = e.target as HTMLElement | null
  if (!panel || !target || !document.contains(target)) return
  if (panel.contains(target) || target.id === BUTTON_ID) return
  const draft = panel.querySelector<HTMLTextAreaElement>(".wiki-comment-text")?.value.trim()
  if (draft) return
  closePanel()
}

document.addEventListener("selectionchange", onSelectionChange)
document.addEventListener("click", onDocumentClick)
window.addEventListener("resize", onResize)
document.addEventListener("wiki-panel-open", (e) => {
  if ((e as CustomEvent).detail !== PANEL_ID) closePanel()
})

document.addEventListener("nav", () => {
  closePanel()
  removeFloating()

  const pageButton = document.getElementById("wiki-comment-page")
  if (!pageButton) return
  const onClick = () => openPanel("", null)
  pageButton.addEventListener("click", onClick)
  window.addCleanup(() => pageButton.removeEventListener("click", onClick))
})
