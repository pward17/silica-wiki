import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { repoPath } from "../util/build"
import { DiffLine, Hunk } from "../util/linediff"
import { MetaChange, lastChange } from "../util/pagechanges"
import style from "./styles/pagechanges.scss"
// @ts-ignore
import script from "./scripts/pagechanges.inline"

// Past this many diff lines the panel stops and says how many are left.
const MAX_LINES = 400

const LABELS: Record<string, string> = {
  approved_by: "approved by",
  superseded_by: "superseded by",
}

function metaText(change: MetaChange): string {
  if (change.key === "renamed") return `renamed from ${change.from}`
  if (change.key === "approved_by" && !change.from) return `approved by ${change.to}`
  const key = LABELS[change.key] ?? change.key
  if (change.from && change.to) return `${key}: ${change.from} → ${change.to}`
  if (change.to) return `${key} set to ${change.to}`
  return `${key} removed (was ${change.from})`
}

function Line({ line }: { line: DiffLine }) {
  const sign = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "
  const Mark = line.kind === "add" ? "ins" : "del"
  return (
    <div class={`page-changes-line page-changes-${line.kind}`}>
      <span class="page-changes-sign" aria-hidden="true">
        {sign}
      </span>
      <span class="page-changes-text">
        {line.pieces
          ? line.pieces.map((p) => (p.changed ? <Mark>{p.text}</Mark> : p.text))
          : line.text || " "}
      </span>
    </div>
  )
}

function Diff({ hunks }: { hunks: Hunk[] }) {
  let shown = 0
  let hidden = 0
  const parts = hunks.map((hunk) => {
    if ("skipped" in hunk) {
      return (
        <div class="page-changes-gap">
          {hunk.skipped} unchanged {hunk.skipped === 1 ? "line" : "lines"}
        </div>
      )
    }
    const room = Math.max(0, MAX_LINES - shown)
    shown += Math.min(room, hunk.lines.length)
    hidden += Math.max(0, hunk.lines.length - room)
    return hunk.lines.slice(0, room).map((line) => <Line line={line} />)
  })
  return (
    <div class="page-changes-diff">
      {parts}
      {hidden > 0 && (
        <div class="page-changes-gap">
          {hidden} more changed {hidden === 1 ? "line" : "lines"} not shown
        </div>
      )}
    </div>
  )
}

// "What changed": a button by the page's status that opens its last change,
// read from git when the site is built (quartz/util/pagechanges.ts). A page
// whose history the build cannot see shows no button.
const PageChanges: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const change = lastChange(repoPath(fileData.filePath))
  if (!change) return null

  return (
    <>
      <span class={classNames(displayClass, "page-changes-toggle")}>
        <button type="button" aria-expanded="false" aria-controls="page-changes">
          What changed
        </button>
      </span>
      <div id="page-changes" class={classNames(displayClass, "page-changes")} hidden>
        {change.later.map((c) => (
          <p class="page-changes-note">
            {c.date}: {c.meta.length ? c.meta.map(metaText).join("; ") : c.subject}
          </p>
        ))}
        <p class="page-changes-head">
          {change.created ? "Created" : "Last changed"} {change.date} by {change.author}:{" "}
          <q>{change.subject}</q>
        </p>
        {change.meta.length > 0 && (
          <p class="page-changes-note">{change.meta.map(metaText).join("; ")}</p>
        )}
        {change.created ? (
          <p class="page-changes-note">The page was new in this change.</p>
        ) : (
          <Diff hunks={change.hunks} />
        )}
      </div>
    </>
  )
}

PageChanges.css = style
PageChanges.afterDOMLoaded = script

export default (() => PageChanges) satisfies QuartzComponentConstructor
