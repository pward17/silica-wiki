// Silica wiki content-model helpers, shared by build-time components.
// Three axes travel together and never mean the same thing: status is author
// intent about the text, approved_by is human review of the text, and
// implementation is whether the thing the page describes exists yet.
// The rules behind them live in content/meta/status-model.md.

// Status is only how far the text can be trusted. Whether a decision is made
// is read from the page itself (see isUndecided), so no status means "undecided".
export const STATUS_VALUES = ["slop", "draft", "active", "superseded"] as const
export type WikiStatus = (typeof STATUS_VALUES)[number]

export const TYPE_VALUES = ["entity", "concept", "decision", "index"] as const
export type WikiType = (typeof TYPE_VALUES)[number]

// Trust palette: status -> fill. Each value is dark or light enough to carry
// its STATUS_INK text at 4.5:1, so the chips read on both themes.
export const STATUS_COLORS: Record<WikiStatus, string> = {
  active: "#1e7d72",
  draft: "#e9c46a",
  slop: "#c1121f",
  superseded: "#6f6f6f",
}

// Text colour for a filled chip. Only the yellow needs dark text.
export const STATUS_INK: Record<WikiStatus, string> = {
  active: "#ffffff",
  draft: "#1b1b1b",
  slop: "#ffffff",
  superseded: "#ffffff",
}

export const IMPLEMENTATION_VALUES = ["planned", "partial", "built"] as const
export type WikiImplementation = (typeof IMPLEMENTATION_VALUES)[number]

// Reality palette: implementation -> accent. These chips are outlined and
// washed where the status chips are filled, so a reader never takes the two
// axes for one label.
export const IMPLEMENTATION_COLORS: Record<WikiImplementation, string> = {
  planned: "#6b7fa8",
  partial: "#c08a2e",
  built: "#3d8f63",
}

export const IMPLEMENTATION_TINTS: Record<WikiImplementation, string> = {
  planned: "#6b7fa824",
  partial: "#c08a2e24",
  built: "#3d8f6324",
}

// "partial" alone reads as a hedge about the writing; the chip spells out
// that it is a claim about the software.
export const IMPLEMENTATION_LABELS: Record<WikiImplementation, string> = {
  planned: "planned",
  partial: "partly built",
  built: "built",
}

// A folder page's slug is "index" (the root) or ends in "/index".
export const isFolderSlug = (slug: string | undefined) =>
  slug === "index" || (slug?.endsWith("/index") ?? false)

// How many pages under a folder are planned, partly built and built. A folder
// describes several things at different stages, so one hand-written value on
// it said little and went stale; this count is worked out at build time from
// the pages themselves. Folder pages and superseded pages are left out:
// neither describes software that is running or coming.
export function implementationSummary(
  folderSlug: string,
  pages: { slug?: string; frontmatter?: unknown }[],
): Record<WikiImplementation, number> {
  const prefix = folderSlug.slice(0, -"index".length)
  const counts: Record<WikiImplementation, number> = { planned: 0, partial: 0, built: 0 }
  for (const page of pages) {
    if (!page.slug?.startsWith(prefix) || isFolderSlug(page.slug)) continue
    if (getWikiStatus(page.frontmatter) === "superseded") continue
    const value = getWikiImplementation(page.frontmatter)
    if (value) counts[value]++
  }
  return counts
}

// The undecided chip: the colour that used to mark the retired "open" status.
export const UNDECIDED_COLOR = "#c8502f"
export const UNDECIDED_INK = "#ffffff"

// A decision is made when its page has a "## Chosen" section; until then the
// page is a set of options and the chip says so. Worked out from the page, so
// it cannot disagree with the body. A superseded decision is history, not a
// question waiting on anyone.
export function isUndecided(frontmatter: unknown, headings: string[]) {
  if (getWikiType(frontmatter) !== "decision") return false
  if (getWikiStatus(frontmatter) === "superseded") return false
  return !headings.some((h) => /^Chosen\b/.test(h.trim()))
}

export interface Approval {
  who: string
  when?: string
}

function pick<T extends string>(frontmatter: unknown, key: string, values: readonly T[]) {
  const value = (frontmatter as Record<string, unknown> | undefined)?.[key]
  if (typeof value === "string" && (values as readonly string[]).includes(value)) {
    return value as T
  }
  return undefined
}

export const getWikiStatus = (fm: unknown) => pick(fm, "status", STATUS_VALUES)
export const getWikiType = (fm: unknown) => pick(fm, "type", TYPE_VALUES)
export const getWikiImplementation = (fm: unknown) =>
  pick(fm, "implementation", IMPLEMENTATION_VALUES)

export function getApprovals(frontmatter: unknown): Approval[] {
  const raw = (frontmatter as Record<string, unknown> | undefined)?.approved_by
  if (!Array.isArray(raw)) return []
  const approvals: Approval[] = []
  for (const entry of raw) {
    if (typeof entry === "string" && entry.trim() !== "") {
      approvals.push({ who: entry.trim() })
    } else if (entry && typeof entry === "object") {
      const { who, when } = entry as Record<string, unknown>
      if (typeof who === "string" && who.trim() !== "") {
        // YAML reads an unquoted date as a Date; keep only the day.
        const day =
          when instanceof Date
            ? when.toISOString().slice(0, 10)
            : typeof when === "string"
              ? when
              : undefined
        approvals.push({ who: who.trim(), when: day })
      }
    }
  }
  return approvals
}
