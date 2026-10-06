#!/usr/bin/env node
// Wiki content lint: frontmatter contract, wikilink resolution, footnote dating.
// Usage: node scripts/lint-wiki.mjs [--strict]
// Without --strict problems are reported but the exit code stays 0.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, basename, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const WIKI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")
const CONTENT_DIR = join(WIKI_DIR, "content")

// Per-project settings live in silica.config.json at the wiki root, which
// Silica itself never ships, so pulling Silica updates never conflicts with it.
const CONFIG_FILE = join(WIKI_DIR, "silica.config.json")
const config = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {}

// A page this long is several pages.
const MAX_LINES = config.maxLines ?? 999
// A title is a name, not a sentence; the detail belongs in the description.
// A preference, not a rule: a longer title warns but never fails --strict.
const MAX_TITLE_WORDS = config.maxTitleWords ?? 4
const STRICT = process.argv.includes("--strict")

const STATUS_VALUES = ["slop", "draft", "active", "superseded"]
const TYPE_VALUES = ["entity", "concept", "decision", "index"]
const IMPLEMENTATION_VALUES = ["planned", "partial", "built"]

// `implementation:` answers "does the software this page describes exist yet",
// so it belongs on the trees that document the product and nowhere else. The
// wiki's own conventions and the company itself are neither built nor
// planned, and a value there would be noise. Path-based rather than
// type-based on purpose: a decision page is meaningfully decided-but-unbuilt,
// which is the case the field is most useful for.
const IMPLEMENTATION_TREES = config.implementationFolders ?? ["technical/", "product/"]
const wantsImplementation = (slug) => IMPLEMENTATION_TREES.some((tree) => slug.startsWith(tree))

/** @returns {string[]} */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walk(full))
    } else if (entry.endsWith(".md") && !entry.endsWith(".local.md")) {
      out.push(full)
    }
  }
  return out
}

const files = walk(CONTENT_DIR)
const problems = []
const report = (file, message) => problems.push({ file: relative(CONTENT_DIR, file), message })
// Warnings are printed but never change the exit code.
const warnings = []
const warn = (file, message) => warnings.push({ file: relative(CONTENT_DIR, file), message })

const basenameOwners = new Map()

// First pass: collect every resolvable wikilink target (basenames, folder slugs, aliases).
const linkTargets = new Set()
const parsed = new Map()
for (const file of files) {
  let fm
  try {
    fm = matter(readFileSync(file, "utf8"))
  } catch (err) {
    report(file, `frontmatter does not parse: ${err.message}`)
    continue
  }
  parsed.set(file, fm)

  const name = basename(file, ".md").toLowerCase()
  // Wikilinks are bare filenames, so two pages sharing one make every bare
  // link to that name ambiguous: the engine picks one, and the other becomes
  // unreachable by its own name. Nothing downstream errors, so catch it here.
  if (name !== "index") {
    if (basenameOwners.has(name)) {
      report(
        file,
        `duplicate page name \`${name}\` (also ${basenameOwners.get(name)}) - a bare [[${name}]] cannot resolve to both`,
      )
    } else {
      basenameOwners.set(name, relative(CONTENT_DIR, file))
    }
  }
  linkTargets.add(name)
  const rel = relative(CONTENT_DIR, file).replace(/\.md$/, "").toLowerCase()
  linkTargets.add(rel)
  if (name === "index") {
    linkTargets.add(rel.replace(/\/?index$/, ""))
  }
  const aliases = fm.data?.aliases
  if (Array.isArray(aliases)) {
    for (const alias of aliases) linkTargets.add(String(alias).toLowerCase())
  }
}

// Second pass: per-file checks.
for (const [file, fm] of parsed) {
  const data = fm.data ?? {}
  const isRootIndex = relative(CONTENT_DIR, file) === "index.md"

  if (typeof data.title !== "string" || data.title.trim() === "") {
    report(file, "title is missing (the rendered H1 comes from frontmatter, not the body)")
  } else {
    const words = data.title.trim().split(/\s+/).length
    if (words > MAX_TITLE_WORDS) {
      warn(
        file,
        `title has ${words} words (aim for ${MAX_TITLE_WORDS} or fewer); name the subject and move the detail to description`,
      )
    }
  }
  if (/^# /m.test(fm.content.replace(/```[\s\S]*?```/g, ""))) {
    report(file, "body starts a markdown H1; the H1 comes from frontmatter title")
  }
  if (data.status === "open") {
    report(
      file,
      'status "open" is retired: status says how far the text can be trusted (slop until a human reads it), and the undecided chip comes from the page having no "## Chosen" section',
    )
  } else if (!STATUS_VALUES.includes(data.status)) {
    report(file, `status "${data.status}" is not one of: ${STATUS_VALUES.join(", ")}`)
  }
  if (!TYPE_VALUES.includes(data.type)) {
    report(file, `type "${data.type}" is not one of: ${TYPE_VALUES.join(", ")}`)
  }
  if (typeof data.description !== "string" || data.description.trim() === "") {
    report(file, "description is missing or empty")
  }
  const slug = relative(CONTENT_DIR, file)
  // A folder page describes several things at different stages, so the badge
  // counts its pages' values instead; a hand-written one only goes stale.
  const isFolderPage = basename(file) === "index.md"
  if (wantsImplementation(slug) && !isFolderPage) {
    if (!IMPLEMENTATION_VALUES.includes(data.implementation)) {
      report(
        file,
        `implementation "${data.implementation}" is not one of: ${IMPLEMENTATION_VALUES.join(", ")}`,
      )
    }
  } else if (data.implementation !== undefined && isFolderPage) {
    report(
      file,
      "implementation is set on a folder page; its badge counts the values of the pages under it, so drop the field",
    )
  } else if (data.implementation !== undefined) {
    report(
      file,
      `implementation is set on a page outside ${IMPLEMENTATION_TREES.join(", ")}, where the question does not apply`,
    )
  }
  if (data.status === "superseded" && !data.superseded_by) {
    report(file, "status is superseded but superseded_by is missing")
  }
  if (data.superseded_by && data.status !== "superseded") {
    report(file, "superseded_by is set but status is not superseded")
  }
  if (!data.updated) {
    report(file, "updated date is missing")
  }
  if (data.approved_by !== undefined) {
    if (!Array.isArray(data.approved_by)) {
      report(file, "approved_by must be a list of { who, when } entries")
    } else {
      for (const entry of data.approved_by) {
        const ok =
          (typeof entry === "string" && entry.trim() !== "") ||
          (entry && typeof entry === "object" && typeof entry.who === "string")
        if (!ok) report(file, `approved_by entry ${JSON.stringify(entry)} lacks a "who"`)
      }
      // One person is one approval. Two spellings of a name read as two
      // reviewers, which is a worse claim than a missing one: it invents a
      // second pair of eyes.
      const seen = new Set()
      for (const entry of data.approved_by) {
        const who = typeof entry === "string" ? entry : entry?.who
        if (typeof who !== "string") continue
        const name = who.trim().toLowerCase()
        if (seen.has(name)) report(file, `approved_by names "${who.trim()}" twice`)
        seen.add(name)
      }
      // Demoting a page to slop withdraws its approvals: slop says nobody has
      // read this text. Checked here because this gate is the one thing every
      // writer passes through.
      if (data.status === "slop" && data.approved_by.length > 0) {
        report(
          file,
          "status is slop but approved_by still carries an approval; slop says nobody has read this text, so the vouch went with it",
        )
      }
    }
  }

  // A Mermaid block that does not open with a diagram type renders as an error
  // box on the page. This catches the fence-with-nothing-in-it and the pasted
  // prose; real syntax errors deeper in the block still need a local preview.
  const DIAGRAM_TYPES =
    /^(flowchart|graph|sequenceDiagram|stateDiagram(-v2)?|classDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/
  for (const match of fm.content.matchAll(/```mermaid[^\n]*\n([\s\S]*?)```/g)) {
    const lines = match[1].split("\n").map((l) => l.trim())
    let i = 0
    if (lines[i] === "---") {
      i = lines.indexOf("---", 1) + 1
    }
    while (i < lines.length && (lines[i] === "" || lines[i].startsWith("%%"))) i++
    const first = lines[i] ?? ""
    if (!DIAGRAM_TYPES.test(first)) {
      report(
        file,
        `mermaid block does not open with a diagram type (starts with "${first.slice(0, 30)}")`,
      )
    }
  }

  // Wikilinks resolve. Strip code blocks/inline code first to avoid false hits.
  const body = fm.content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "")
  for (const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const target = match[1].trim().toLowerCase()
    if (target.startsWith("tags/")) continue
    if (!linkTargets.has(target)) {
      report(file, `wikilink [[${match[1].trim()}]] does not resolve to any page`)
    }
  }

  // Footnote definitions must carry a date (YYYY-MM-DD).
  for (const match of body.matchAll(/^\[\^([^\]]+)\]:(.*)$/gm)) {
    if (!/\d{4}-\d{2}-\d{2}/.test(match[2])) {
      report(file, `footnote [^${match[1]}] has no date (every footnote needs YYYY-MM-DD)`)
    }
  }

  // Forbidden pattern: a manual Sources heading (the engine generates the footnotes block).
  if (/^#{1,6}\s+Sources\s*$/m.test(body)) {
    report(
      file,
      'manual "Sources" heading is forbidden; footnote definitions go at the end, no heading',
    )
  }

  // PLANNED: markers say which paragraphs of a part-built page describe
  // something that does not exist yet. The three rules close on each other: a
  // partial page without markers tells a reader some of it is fiction and
  // leaves them to guess which, and a marker anywhere else is either a
  // mislabelled page or noise on a page that is already all plan.
  const planned = [...body.matchAll(/^\s*(?:[-*+]\s+|>\s*)?PLANNED:/gm)]
  if (data.implementation === "partial" && planned.length === 0) {
    report(
      file,
      "implementation is partial but no paragraph carries a PLANNED: marker: say which parts are unbuilt, or set planned or built",
    )
  }
  if (planned.length > 0 && data.implementation === "built") {
    report(
      file,
      `${planned.length} PLANNED: marker(s) on a built page: set implementation to partial, or drop the markers`,
    )
  }
  if (planned.length > 0 && data.implementation === "planned") {
    report(
      file,
      `${planned.length} PLANNED: marker(s) on a page that is all plan: the marker says nothing the status does not`,
    )
  }
  if (planned.length > 0 && data.implementation === undefined) {
    report(
      file,
      `${planned.length} PLANNED: marker(s) on a page with no implementation value: the marker belongs on the partial page that describes the unbuilt part`,
    )
  }

  // Who is BUILDING something is bookkeeping: true for a fortnight, corrected by
  // nobody, misinforming thereafter. It belongs in the tracker, and who DECIDED it
  // belongs in a dated footnote, which is why footnote definitions are exempt
  // here. Vale cannot draw that line (Go regexp has no lookbehind, so it cannot
  // tell a footnote line from a body line), so the check lives here.
  // Deliberately narrow: only the verb phrases that assign unbuilt work. Naming
  // a durable component owner or a page whose subject is people both pass.
  const ASSIGNEE =
    /\b[A-Z][a-z]+ (?:is building|is designing|is implementing|builds it|will build|heads the|has taken|has the build)\b/
  for (const line of body.split("\n")) {
    if (line.startsWith("[^")) continue
    const hit = line.match(ASSIGNEE)
    if (hit) {
      report(
        file,
        `assignee in the body: "${hit[0]}". Who is building something goes to the tracker; who decided it goes to a dated footnote`,
      )
    }
  }

  // Unverified markers are how a writer admits it could not check something.
  // They are welcome on a draft and disqualifying on a page claiming to be
  // current knowledge, which is what makes the honest option cheap to take.
  const unverified = [...body.matchAll(/TODO\(([^)]*)\):\s*unverified/g)]
  if (unverified.length > 0 && data.status === "active") {
    report(
      file,
      `${unverified.length} unverified marker(s) on a ${data.status} page: verify the claim or move the page back to draft`,
    )
  }

  // Divergence bullets self-expire: without a date nobody can tell whether the
  // gap between intent and reality still exists.
  const openQuestions = body.split(/^#{1,6}\s+Open questions\s*$/m)[1]
  if (openQuestions) {
    const section = openQuestions.split(/^#{1,6}\s+/m)[0]
    for (const line of section.split("\n")) {
      const bullet = line.trim()
      if (bullet.startsWith("- ") && !/\d{4}-\d{2}-\d{2}/.test(bullet) && bullet.length > 12) {
        report(file, `Open questions bullet has no date: ${bullet.slice(0, 60)}...`)
      }
    }
  }

  // A description that repeats the opening sentence tells a reader on a folder
  // card nothing they will not immediately read again.
  const firstParagraph = body
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim()
  if (firstParagraph && typeof data.description === "string") {
    const normalize = (s) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .trim()
    if (normalize(firstParagraph).startsWith(normalize(data.description).slice(0, 60))) {
      report(file, "description duplicates the body's first paragraph")
    }
  }

  const lineCount = fm.orig.toString().split("\n").length
  if (lineCount > MAX_LINES) {
    report(
      file,
      `${lineCount} lines; split the page so each file stays under ${MAX_LINES + 1} lines`,
    )
  }

  if (isRootIndex && data.type !== "index") {
    report(file, "the root index.md must have type: index")
  }
}

for (const { file, message } of warnings) {
  console.log(`  warning: ${file}: ${message}`)
}

if (problems.length === 0) {
  console.log(`wiki lint: ${files.length} pages, no problems`)
  process.exit(0)
}

console.log(`wiki lint: ${problems.length} problem(s) across ${files.length} pages\n`)
for (const { file, message } of problems) {
  console.log(`  ${file}: ${message}`)
}
process.exit(STRICT ? 1 : 0)
