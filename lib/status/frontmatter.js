// Edits a page's frontmatter as text, one key at a time, so a status change
// touches only the lines it means to and the rest of the file comes back
// byte for byte. A YAML round trip would reflow quoting, comments and key
// order across the whole block.

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/

export function splitFrontmatter(text) {
  const match = text.match(FENCE)
  if (!match) return null
  return { lines: match[1].split(/\r?\n/), rest: text.slice(match[0].length), eol: match[2] }
}

export function joinFrontmatter({ lines, rest, eol }) {
  return `---\n${lines.join("\n")}\n---${eol || "\n"}${rest}`
}

// Where a top-level key sits: its own line plus every indented or list line
// under it, which is how a block-style value continues.
function keySpan(lines, key) {
  const start = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line))
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && /^(\s+|-\s|-$)/.test(lines[end])) end++
  return { start, end }
}

const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, "$2")

export function readKey(lines, key) {
  const span = keySpan(lines, key)
  if (!span) return undefined
  return unquote(lines[span.start].replace(/^[^:]*:/, "").replace(/\s+#.*$/, ""))
}

// Replaces a key's value, or adds the key after `after` (or at the end).
export function setKey(lines, key, value, after) {
  const line = `${key}: ${value}`
  const span = keySpan(lines, key)
  if (span) {
    lines.splice(span.start, span.end - span.start, line)
    return
  }
  const anchor = after ? keySpan(lines, after) : null
  lines.splice(anchor ? anchor.end : lines.length, 0, line)
}

export function removeKey(lines, key) {
  const span = keySpan(lines, key)
  if (span) lines.splice(span.start, span.end - span.start)
}

// approved_by in any of the forms the lint and the badge accept: a flow list
// of `{ who, when }` maps, a block list of the same, or bare names.
export function readApprovals(lines) {
  const span = keySpan(lines, "approved_by")
  if (!span) return []
  const text = lines
    .slice(span.start, span.end)
    .join("\n")
    .replace(/^approved_by\s*:/, "")
  const approvals = []
  const maps = text.match(/\{[^}]*\}|-\s*who\s*:[^\n]*(\n\s+when\s*:[^\n]*)?/g)
  if (maps) {
    for (const map of maps) {
      const who = map.match(/who\s*:\s*("[^"]*"|'[^']*'|[^,}\n]+)/)
      const when = map.match(/when\s*:\s*("[^"]*"|'[^']*'|[^,}\n]+)/)
      if (who && unquote(who[1])) {
        approvals.push({ who: unquote(who[1]), when: when ? unquote(when[1]) : undefined })
      }
    }
    return approvals
  }
  const flow = text.trim().match(/^\[(.*)\]$/s)
  const names = flow ? flow[1].split(",") : text.split("\n").map((l) => l.replace(/^\s*-\s*/, ""))
  for (const name of names.map(unquote)) {
    if (name) approvals.push({ who: name })
  }
  return approvals
}

// A name is written bare unless YAML would read it as something else.
const yamlScalar = (value) =>
  /^[\w][\w .'-]*$/.test(value) && !/^(true|false|null|yes|no|~)$/i.test(value)
    ? value
    : JSON.stringify(value)

export function writeApprovals(lines, approvals) {
  if (approvals.length === 0) {
    removeKey(lines, "approved_by")
    return
  }
  const entries = approvals.map((a) =>
    a.when ? `{ who: ${yamlScalar(a.who)}, when: ${a.when} }` : `{ who: ${yamlScalar(a.who)} }`,
  )
  setKey(lines, "approved_by", `[${entries.join(", ")}]`, "status")
}
