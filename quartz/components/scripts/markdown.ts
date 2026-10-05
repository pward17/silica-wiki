// The small slice of Markdown a comment is written in: fenced code blocks,
// inline code, bold, italic, links, bullet and numbered lists, and line
// breaks. Comment text comes from a browser, so it is never turned into HTML
// as a string: the parsers below produce tokens, and the renderer builds text
// nodes and elements, which cannot carry markup of their own.

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "link"; value: string; href: string }

export type Block =
  | { kind: "code"; value: string; lang?: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }

const FENCE = /^\s*```(\w*)\s*$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/
// A link written out, or one the writer left bare. The trailing punctuation of
// a sentence is not part of the address.
const LINK = /\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/
const CODE = /`([^`\n]+)`/
const STRONG = /\*\*([^*\n]+)\*\*|__([^_\n]+)__/
const EM = /(?<![*\w])\*([^*\n]+)\*(?!\*)|(?<![_\w])_([^_\n]+)_(?![\w_])/

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = []
  const lines = src.replace(/\r\n?/g, "\n").split("\n")
  let i = 0

  while (i < lines.length) {
    const fence = FENCE.exec(lines[i])
    if (fence) {
      const lang = fence[1] || undefined
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      // An unclosed fence still reads as code; dropping it would lose text.
      if (i < lines.length) i++
      blocks.push({ kind: "code", value: body.join("\n"), lang })
      continue
    }

    const bullet = BULLET.exec(lines[i])
    const numbered = bullet ? null : NUMBER.exec(lines[i])
    if (bullet || numbered) {
      const ordered = numbered !== null
      const items: string[] = []
      while (i < lines.length) {
        const match = ordered ? NUMBER.exec(lines[i]) : BULLET.exec(lines[i])
        if (!match) break
        items.push(match[1])
        i++
      }
      blocks.push({ kind: "list", ordered, items })
      continue
    }

    if (lines[i].trim() === "") {
      i++
      continue
    }

    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !FENCE.test(lines[i])) {
      if (BULLET.test(lines[i]) || NUMBER.test(lines[i])) break
      paragraph.push(lines[i])
      i++
    }
    blocks.push({ kind: "paragraph", lines: paragraph })
  }

  return blocks
}

export function parseInline(src: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let rest = src

  const push = (token: InlineToken) => {
    const last = tokens[tokens.length - 1]
    if (token.kind === "text" && token.value === "") return
    if (token.kind === "text" && last?.kind === "text") last.value += token.value
    else tokens.push(token)
  }

  while (rest.length > 0) {
    const candidates: { at: number; length: number; token: InlineToken }[] = []

    const code = CODE.exec(rest)
    if (code)
      candidates.push({
        at: code.index,
        length: code[0].length,
        token: { kind: "code", value: code[1] },
      })

    const link = LINK.exec(rest)
    if (link) {
      const href = link[2] ?? link[3]
      const label = link[1] !== undefined && link[1] !== "" ? link[1] : href
      candidates.push({
        at: link.index,
        length: link[0].length,
        token: { kind: "link", value: label, href },
      })
    }

    const strong = STRONG.exec(rest)
    if (strong) {
      const value = strong[1] ?? strong[2]
      candidates.push({
        at: strong.index,
        length: strong[0].length,
        token: { kind: "strong", value },
      })
    }

    const em = EM.exec(rest)
    if (em) {
      const value = em[1] ?? em[2]
      candidates.push({ at: em.index, length: em[0].length, token: { kind: "em", value } })
    }

    if (candidates.length === 0) {
      push({ kind: "text", value: rest })
      break
    }

    // The earliest match wins, and the longest of those, so `**a**` reads as
    // bold rather than as an italic star.
    candidates.sort((a, b) => a.at - b.at || b.length - a.length)
    const winner = candidates[0]
    push({ kind: "text", value: rest.slice(0, winner.at) })
    push(winner.token)
    rest = rest.slice(winner.at + winner.length)
  }

  return tokens
}

/** The same text with its markup taken off, for a one-line preview. */
export function plainText(src: string): string {
  const parts: string[] = []
  for (const block of parseBlocks(src)) {
    if (block.kind === "code") {
      parts.push(block.value)
      continue
    }
    const lines = block.kind === "list" ? block.items : block.lines
    for (const line of lines) {
      parts.push(
        parseInline(line)
          .map((token) => token.value)
          .join(""),
      )
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function inlineInto(parent: Node, src: string) {
  for (const token of parseInline(src)) {
    if (token.kind === "text") {
      parent.appendChild(document.createTextNode(token.value))
      continue
    }
    if (token.kind === "link") {
      const anchor = document.createElement("a")
      anchor.href = token.href
      anchor.textContent = token.value
      anchor.target = "_blank"
      anchor.rel = "noopener nofollow ugc"
      parent.appendChild(anchor)
      continue
    }
    const tag = token.kind === "code" ? "code" : token.kind === "strong" ? "strong" : "em"
    const node = document.createElement(tag)
    node.textContent = token.value
    parent.appendChild(node)
  }
}

/** Comment text as nodes. Nothing here ever assigns HTML from the string. */
export function renderMarkdown(src: string): DocumentFragment {
  const out = document.createDocumentFragment()

  for (const block of parseBlocks(src)) {
    if (block.kind === "code") {
      const pre = document.createElement("pre")
      const code = document.createElement("code")
      if (block.lang) code.dataset.lang = block.lang
      code.textContent = block.value
      pre.appendChild(code)
      out.appendChild(pre)
      continue
    }

    if (block.kind === "list") {
      const list = document.createElement(block.ordered ? "ol" : "ul")
      for (const item of block.items) {
        const li = document.createElement("li")
        inlineInto(li, item)
        list.appendChild(li)
      }
      out.appendChild(list)
      continue
    }

    const paragraph = document.createElement("p")
    block.lines.forEach((line, index) => {
      if (index > 0) paragraph.appendChild(document.createElement("br"))
      inlineInto(paragraph, line)
    })
    out.appendChild(paragraph)
  }

  return out
}
