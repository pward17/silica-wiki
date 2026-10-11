import { execFileSync } from "child_process"
import yaml from "js-yaml"
import { getApprovals } from "./wiki"
import { diffLines, Hunk, hunks } from "./linediff"

// A page's last change, read from git at build time for the "What changed"
// panel. The last change is the newest commit that touched the page's body:
// commits that only edit the frontmatter (a status promotion, an approval)
// are listed above it as notes rather than shown as a one-line diff.
//
// It needs the history on the build machine. A shallow clone that stops
// before the page's last change gives undefined, and the page shows no panel
// rather than a wrong one.

export interface MetaChange {
  key: string
  from?: string
  to?: string
}

export interface Commit {
  date: string
  author: string
  subject: string
}

export interface PageChange extends Commit {
  // The page was added in this commit, so there is nothing to compare.
  created: boolean
  hunks: Hunk[]
  // Frontmatter changes in the same commit.
  meta: MetaChange[]
  // Newer commits that changed only the frontmatter, newest first.
  later: (Commit & { meta: MetaChange[] })[]
}

// The frontmatter fields worth a note when they change.
const META_KEYS = ["title", "type", "status", "implementation", "superseded_by", "approved_by"]
// How far back to look for a change to the body.
const MAX_COMMITS = 30

let top: string | null | undefined
let shallow = false

function git(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: top ?? undefined,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return undefined
  }
}

function repository(): boolean {
  if (top === undefined) {
    top = git(["rev-parse", "--show-toplevel"])?.trim() || null
    shallow = git(["rev-parse", "--is-shallow-repository"])?.trim() === "true"
  }
  return top !== null
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

function split(source: string): { meta: Record<string, unknown>; body: string } {
  const match = source.match(FRONTMATTER)
  if (!match) return { meta: {}, body: source }
  let meta: Record<string, unknown> = {}
  try {
    const parsed = yaml.load(match[1])
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>
  } catch {
    // Unreadable frontmatter: compare the bodies anyway.
  }
  return { meta, body: source.slice(match[0].length) }
}

function show(meta: Record<string, unknown>, key: string): string | undefined {
  if (key === "approved_by") {
    const approvals = getApprovals(meta)
    return approvals.length ? approvals.map((a) => a.who).join(", ") : undefined
  }
  const value = meta[key]
  if (value === undefined || value === null || value === "") return undefined
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return Array.isArray(value) ? value.join(", ") : String(value)
}

function metaChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: MetaChange[] = []
  for (const key of META_KEYS) {
    const from = show(before, key)
    const to = show(after, key)
    if (from !== to) changes.push({ key, from, to })
  }
  return changes
}

interface Entry extends Commit {
  hash: string
  parent?: string
}

// Up to `limit` commits that touched `path`, newest first, from `rev` back.
// No --follow: it loses the subtree merges that bring Silica's pages into a
// project. Renames are found one at a time instead (renamedFrom).
function history(path: string, rev: string, limit: number): Entry[] {
  const out = git([
    "log",
    "--format=%x1e%H%x1f%P%x1f%aI%x1f%an%x1f%s",
    `-n${limit}`,
    rev,
    "--",
    path,
  ])
  if (!out) return []
  return out
    .split("\x1e")
    .slice(1)
    .map((record) => {
      const [header] = record.split("\n")
      const [hash, parents, date, author, subject] = header.split("\x1f")
      return {
        hash,
        // A merge is compared with its first parent, the branch it landed on.
        parent: parents.split(" ")[0] || undefined,
        date: date.slice(0, 10),
        author,
        subject,
      }
    })
}

// The path `path` had before `hash` renamed it, if that commit was a rename.
function renamedFrom(hash: string, path: string): string | undefined {
  const out = git(["show", "-M", "--name-status", "--diff-merges=first-parent", "--format=", hash])
  for (const line of out?.split("\n") ?? []) {
    const [status, from, to] = line.split("\t")
    if (status?.startsWith("R") && to === path) return from
  }
  return undefined
}

function pageName(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.md$/, "")
}

// `path` is from the repository root, as repoPath gives it.
export function lastChange(path: string | undefined): PageChange | undefined {
  if (!path || !repository()) return undefined
  const later: PageChange["later"] = []
  let current = path
  let rev = "HEAD"
  let budget = MAX_COMMITS
  while (budget > 0) {
    const entries = history(current, rev, budget)
    if (entries.length === 0) return undefined
    budget -= entries.length
    let renamed = false

    for (const entry of entries) {
      const commit: Commit = { date: entry.date, author: entry.author, subject: entry.subject }
      const after = git(["show", `${entry.hash}:${current}`])
      if (after === undefined) return undefined
      const now = split(after)

      // A shallow clone's oldest commit has no parent, and adds every file.
      if (!entry.parent) {
        return shallow ? undefined : { ...commit, created: true, hunks: [], meta: [], later }
      }
      // Not in the parent: added here, or renamed. A merge lists no files, so
      // this asks the parent rather than reading the commit's file list.
      const before = git(["show", `${entry.parent}:${current}`])
      const from = before !== undefined ? current : renamedFrom(entry.hash, current)
      if (!from) {
        // A missing parent is the edge of a shallow clone, not a new page.
        if (shallow && git(["cat-file", "-e", `${entry.parent}^{commit}`]) === undefined) {
          return undefined
        }
        return { ...commit, created: true, hunks: [], meta: [], later }
      }

      const source = before ?? git(["show", `${entry.parent}:${from}`])
      if (source === undefined) return undefined
      const then = split(source)
      const meta = metaChanges(then.meta, now.meta)
      if (from !== current)
        meta.unshift({ key: "renamed", from: pageName(from), to: pageName(current) })
      if (then.body !== now.body) {
        const lines = diffLines(then.body.split(/\r?\n/), now.body.split(/\r?\n/))
        return { ...commit, created: false, hunks: hunks(lines), meta, later }
      }
      later.push({ ...commit, meta })
      if (from !== current) {
        // The older history is under the old name.
        current = from
        rev = entry.parent
        renamed = true
        break
      }
    }
    if (!renamed) return undefined
  }
  return undefined
}
