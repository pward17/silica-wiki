// Silica wiki content-model helpers, shared by build-time components.
// Three axes travel together and never mean the same thing: status is author
// intent about the text, approved_by is human review of the text, and
// implementation is whether the thing the page describes exists yet.
// The rules behind them live in content/meta/status-model.md.

export const STATUS_VALUES = ["slop", "draft", "active", "open", "superseded"] as const
export type WikiStatus = (typeof STATUS_VALUES)[number]

export const TYPE_VALUES = ["entity", "concept", "decision", "index"] as const
export type WikiType = (typeof TYPE_VALUES)[number]

// Trust palette: status -> fill. Each value is dark or light enough to carry
// its STATUS_INK text at 4.5:1, so the chips read on both themes.
export const STATUS_COLORS: Record<WikiStatus, string> = {
  active: "#1e7d72",
  draft: "#e9c46a",
  open: "#c8502f",
  slop: "#c1121f",
  superseded: "#6f6f6f",
}

// Text colour for a filled chip. Only the yellow needs dark text.
export const STATUS_INK: Record<WikiStatus, string> = {
  active: "#ffffff",
  draft: "#1b1b1b",
  open: "#ffffff",
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
