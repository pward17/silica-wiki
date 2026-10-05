// How a reader comment is written into an issue, and how it is read back.
//
// The body a person sees on GitHub is markdown. The part the site needs back
// (which page, which lines, at which commit, which passage) rides along as an
// HTML comment, invisible when rendered and parsed as JSON rather than by
// picking the prose apart.

export const LABEL = "wiki-comment"
export const MAX_BODY = 4000
export const MAX_QUOTE = 1200

const META_OPEN = "<!-- wiki-comment "
const META_CLOSE = " -->"
const META_PATTERN = /<!-- wiki-comment (\{[\s\S]*?\}) -->/

// Everything the bot posts carries the writer's address on a "From" line, so
// a thread on GitHub reads correctly and the site can show who spoke. On an
// issue that line follows the page and source lines; on a reply it comes first.
const FROM_LINE = /^\*\*From:\*\* (\S+)/m
const LEADING_FROM = /^\*\*From:\*\* \S+\s*\n\n?/

export function issueBody({
  pagePath,
  pageTitle,
  pageUrl,
  email,
  quote,
  comment,
  commit,
  lines,
  repo,
}) {
  const anchor = lines ? `#L${lines.replace("-", "-L")}` : ""
  const where = `${pagePath}${lines ? ` L${lines}` : ""}`
  const source = commit
    ? `[${where}](https://github.com/${repo}/blob/${commit}/${pagePath}${anchor}) at \`${commit.slice(0, 7)}\``
    : where
  const meta = { v: 1, path: pagePath, lines, commit, quote }

  return [
    `**Page:** [${pageTitle || pagePath}](${pageUrl})`,
    `**Source:** ${source}`,
    `**From:** ${email}`,
    "",
    quote
      ? `> ${quote.replace(/\n/g, "\n> ")}`
      : "_No text selected: this is about the page as a whole._",
    "",
    comment,
    "",
    // The JSON never contains "-->": every field is either validated or
    // escaped when the record is parsed, and "--" cannot survive JSON.stringify
    // inside a string without being harmless text.
    `${META_OPEN}${JSON.stringify(meta).replace(/-->/g, "--\\u003e")}${META_CLOSE}`,
  ].join("\n")
}

const REPLY_META = /<!-- wiki-reply-to (\{[\s\S]*?\}) -->/
const EXCERPT_CHARS = 80

// The first line of a message, short enough to quote.
export function excerptOf(text) {
  const line = (text || "").split("\n").find((l) => l.trim()) || ""
  const flat = line.replace(/\s+/g, " ").trim()
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS - 1)}\u2026` : flat
}

// A reply, optionally to one message in the thread. GitHub has no nesting, so
// the target travels twice: as a markdown quote a person reads there, and as
// a record the page reads back to draw the reply under the right message.
export function replyBody(email, text, replyTo) {
  const parts = [`**From:** ${email}`, ""]
  if (replyTo) {
    parts.push(`> **${replyTo.who}:** ${replyTo.excerpt}`, "")
  }
  parts.push(text)
  if (replyTo) {
    const record = { id: replyTo.id, who: replyTo.who, excerpt: replyTo.excerpt }
    parts.push("", `<!-- wiki-reply-to ${JSON.stringify(record).replace(/-->/g, "--\\u003e")} -->`)
  }
  return parts.join("\n")
}

export function replyMeta(body) {
  const match = (body || "").match(REPLY_META)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

export function resolveBody(email) {
  return `**From:** ${email}\n\nResolved from the page.`
}

// The record the site anchors on, or null when the issue was not filed by it.
export function parseMeta(body) {
  const match = (body || "").match(META_PATTERN)
  if (!match) return null
  try {
    const meta = JSON.parse(match[1])
    return meta && meta.v === 1 ? meta : null
  } catch {
    return null
  }
}

// The human text of a filed comment: everything between the header lines and
// the metadata block, minus the quoted passage.
export function commentText(body) {
  const withoutMeta = (body || "").replace(META_PATTERN, "").trim()
  const lines = withoutMeta.split("\n")
  let i = 0
  while (i < lines.length && /^\*\*(Page|Source|From):\*\*/.test(lines[i])) i++
  while (i < lines.length && lines[i].trim() === "") i++
  while (i < lines.length && (lines[i].startsWith(">") || lines[i].startsWith("_No text selected")))
    i++
  return lines.slice(i).join("\n").trim()
}

// Who wrote an issue or a reply: the address the bot recorded, or the GitHub
// login of whoever wrote it directly.
export function speaker(body, user) {
  const match = (body || "").match(FROM_LINE)
  return match ? match[1] : user?.login || "unknown"
}

// The reply as typed: without the From line, and without the quote the bot
// added when the reply targeted a message. A quote a person typed by hand on
// GitHub stays, since there is no record saying the bot put it there.
export function replyText(body) {
  const meta = replyMeta(body)
  let text = (body || "").replace(REPLY_META, "").replace(LEADING_FROM, "")
  if (meta) text = text.replace(/^\s*(>.*\n?)+/, "")
  return text.trim()
}
