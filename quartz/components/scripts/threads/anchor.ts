// Where an open comment sits on the page: finding the passage it quotes, or
// the lines it was left on, and wrapping that passage in highlight marks.
// Split from pagethreads.inline.ts, which draws the threads themselves.

import { plainText } from "../markdown"

export const HIGHLIGHT = "wiki-thread"
export const COUNT = "wiki-thread-count"

export interface OpenComment {
  number: number
  url: string
  path: string
  lines: string
  commit: string
  quote: string
  author: string
  created: string
  text: string
  replies: number
}

// ---------- finding the passage ----------

interface TextIndex {
  nodes: { node: Text; start: number }[]
  norm: string
  map: number[]
}

// The article's text as one string with whitespace collapsed, and a map from
// each collapsed position back to the raw one, so a quote can be searched for
// the way a reader saw it and still land on real nodes.
function indexText(root: HTMLElement): TextIndex {
  const nodes: { node: Text; start: number }[] = []
  let raw = ""
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = (node as Text).parentElement
      if (!parent || parent.closest(`script, style, .${COUNT}`)) return NodeFilter.FILTER_REJECT
      // A diagram's source text is in the page until the drawing replaces it;
      // a match there would be wiped by the render. Only the drawn labels count.
      if (parent.closest("code.mermaid") && !parent.closest("svg")) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: raw.length })
    raw += (node as Text).data
  }
  const map: number[] = []
  let norm = ""
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) {
      if (norm.length > 0 && norm[norm.length - 1] !== " ") {
        norm += " "
        map.push(i)
      }
    } else {
      norm += raw[i]
      map.push(i)
    }
  }
  return { nodes, norm, map }
}

function locate(index: TextIndex, rawOffset: number): { node: Text; offset: number } {
  let lo = 0
  let hi = index.nodes.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (index.nodes[mid].start <= rawOffset) lo = mid
    else hi = mid - 1
  }
  const entry = index.nodes[lo]
  return { node: entry.node, offset: rawOffset - entry.start }
}

function blockLine(node: Node): number {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  return Number(el?.closest<HTMLElement>("[data-line]")?.dataset.line ?? 0)
}

export function rangeForQuote(article: HTMLElement, quote: string, nearLine: number): Range | null {
  const needle = quote.replace(/\s+/g, " ").trim()
  if (!needle) return null
  const index = indexText(article)
  const hits: number[] = []
  for (let i = index.norm.indexOf(needle); i !== -1; i = index.norm.indexOf(needle, i + 1)) {
    hits.push(i)
  }
  if (hits.length === 0) return null

  // The same sentence can appear twice; the copy nearest the recorded line wins.
  let hit = hits[0]
  if (hits.length > 1 && nearLine) {
    hit = hits
      .map((h) => ({ h, d: Math.abs(blockLine(locate(index, index.map[h]).node) - nearLine) }))
      .sort((a, b) => a.d - b.d)[0].h
  }

  const start = locate(index, index.map[hit])
  const last = locate(index, index.map[hit + needle.length - 1])
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(last.node, last.offset + 1)
  return range
}

// Fallback when the passage cannot be found: the blocks those lines rendered
// into, valid only while the page is the build the comment was left on.
export function rangeForLines(article: HTMLElement, lines: string): Range | null {
  const [a, b] = lines.split("-").map(Number)
  const from = a
  const to = b || a
  if (!from) return null
  const blocks = Array.from(article.querySelectorAll<HTMLElement>("[data-line]")).filter((el) => {
    const start = Number(el.dataset.line)
    const end = Number(el.dataset.lineEnd || el.dataset.line)
    return start <= to && end >= from
  })
  if (blocks.length === 0) return null
  const range = document.createRange()
  range.setStartBefore(blocks[0])
  range.setEndAfter(blocks[blocks.length - 1])
  return range
}

// ---------- highlighting ----------

function textNodesIn(range: Range): Text[] {
  const root = range.commonAncestorContainer
  if (root.nodeType === Node.TEXT_NODE) return [root as Text]
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      (node as Text).parentElement?.closest(`.${COUNT}`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (range.intersectsNode(node) && (node as Text).data.length > 0) out.push(node as Text)
  }
  return out
}

// Wraps the text inside the range in <mark> elements, one per text node, so a
// passage crossing links or emphasis is highlighted without moving anything.
// Boundary nodes are split first so only the selected characters are covered.
export function wrapRange(range: Range, number: number): HTMLElement[] {
  const { startContainer, startOffset, endContainer, endOffset } = range
  let nodes = textNodesIn(range)

  if (endContainer.nodeType === Node.TEXT_NODE) {
    const end = endContainer as Text
    if (endOffset === 0) nodes = nodes.filter((n) => n !== end)
    else if (endOffset < end.length) end.splitText(endOffset)
  }
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const start = startContainer as Text
    if (startOffset >= start.length) nodes = nodes.filter((n) => n !== start)
    else if (startOffset > 0) {
      const inside = start.splitText(startOffset)
      nodes = nodes.map((n) => (n === start ? inside : n))
    }
  }

  const marks: HTMLElement[] = []
  for (const node of nodes) {
    if (!node.data.trim()) continue
    const mark = document.createElement("mark")
    mark.className = HIGHLIGHT
    mark.dataset.issue = String(number)
    node.parentNode!.insertBefore(mark, node)
    mark.appendChild(node)
    marks.push(mark)
  }
  return marks
}

export function addCount(marks: HTMLElement[], comment: OpenComment) {
  const last = marks[marks.length - 1]
  const bubble = document.createElement("button")
  bubble.type = "button"
  bubble.className = COUNT
  bubble.dataset.issue = String(comment.number)
  bubble.textContent = String(1 + comment.replies)
  bubble.title = `${comment.author}: ${plainText(comment.text).slice(0, 80)}`
  last.insertAdjacentElement("afterend", bubble)
}

export function setCount(number: number, total: number) {
  const bubble = document.querySelector(`.${COUNT}[data-issue="${number}"]`)
  if (bubble) bubble.textContent = String(total)
}

// A quote found inside a rendered diagram cannot be wrapped: a mark inside
// SVG text does not render, and a label that vanishes is worse than no
// highlight. The comment gets a marker line under the diagram instead.
export function insideDiagram(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  if (!element?.closest("svg")) return null
  return element.closest<HTMLElement>("pre, code.mermaid") ?? element.closest<HTMLElement>("svg")
}

export function markDiagram(block: HTMLElement, comment: OpenComment): HTMLElement[] {
  const marker = document.createElement("mark")
  marker.className = `${HIGHLIGHT} wiki-thread-block`
  marker.dataset.issue = String(comment.number)
  marker.dataset.block = "1"
  marker.textContent = `On the diagram: "${comment.quote.slice(0, 60)}"`
  const host = block.closest<HTMLElement>("pre") ?? block
  host.insertAdjacentElement("afterend", marker)
  return [marker]
}

// Puts the text back the way it was: the bubble goes first so the split text
// nodes on either side of it can merge again. A diagram marker has nothing
// inside it to keep and is simply removed.
export function clearHighlight(number: number) {
  document.querySelector(`.${COUNT}[data-issue="${number}"]`)?.remove()
  for (const mark of document.querySelectorAll<HTMLElement>(
    `mark.${HIGHLIGHT}[data-issue="${number}"]`,
  )) {
    if (mark.dataset.block) {
      mark.remove()
      continue
    }
    const parent = mark.parentNode!
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
}
