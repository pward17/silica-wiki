import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import {
  IMPLEMENTATION_COLORS,
  IMPLEMENTATION_LABELS,
  IMPLEMENTATION_TINTS,
  IMPLEMENTATION_VALUES,
  STATUS_COLORS,
  STATUS_INK,
  UNDECIDED_COLOR,
  UNDECIDED_INK,
  getApprovals,
  getWikiImplementation,
  getWikiStatus,
  getWikiType,
  implementationSummary,
  isFolderSlug,
  isUndecided,
} from "../util/wiki"
import { Root, Element } from "hast"
import { visit } from "unist-util-visit"
import { toString } from "hast-util-to-string"
import { buildCommit, repoPath } from "../util/build"
// @ts-ignore
import script from "./scripts/statusmenu.inline"

// The text of every h2 on the page, which is where a decision's "Chosen" sits.
function h2Texts(tree: Root | undefined): string[] {
  const texts: string[] = []
  if (!tree) return texts
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "h2") texts.push(toString(node))
  })
  return texts
}

// Renders the wiki's three axes under the page title: the status chip (author
// intent), the implementation chip (whether the thing exists yet) and the
// approved_by line (human review of the text). On a deployment with the
// status endpoint the status chip opens a menu that commits a status change,
// and going active stamps the name the reader signs with into approved_by
// (statusmenu.inline.ts and functions/api/status.js); otherwise all three
// are read-outs. A
// folder page gets a count of its pages' implementation values in place of a
// value of its own.
const StatusBadge: QuartzComponent = ({
  fileData,
  allFiles,
  tree,
  displayClass,
}: QuartzComponentProps) => {
  const status = getWikiStatus(fileData.frontmatter)
  const implementation = getWikiImplementation(fileData.frontmatter)
  const pageType = getWikiType(fileData.frontmatter)
  const approvals = getApprovals(fileData.frontmatter)
  const undecided = isUndecided(fileData.frontmatter, h2Texts(tree as Root))
  const summary = isFolderSlug(fileData.slug)
    ? implementationSummary(fileData.slug!, allFiles)
    : undefined
  const counted = summary ? IMPLEMENTATION_VALUES.filter((v) => summary[v] > 0).reverse() : []

  if (!status && !implementation && !pageType && approvals.length === 0 && counted.length === 0) {
    return null
  }

  const verification =
    approvals.length > 0
      ? `Verified by ${approvals.map((a) => (a.when ? `${a.who} (${a.when})` : a.who)).join(", ")}`
      : "Not verified"

  return (
    <div
      class={classNames(displayClass, "status-badge")}
      data-page-path={repoPath(fileData.filePath)}
      data-page-commit={buildCommit()}
    >
      {pageType && <span class="type-chip">{pageType}</span>}
      {status && (
        <span class={`status-chip status-${status}`} title="How far along the text is">
          {status}
        </span>
      )}
      {undecided && (
        <span class="undecided-chip" title="No option is chosen yet: this decision needs making">
          undecided
        </span>
      )}
      {implementation && (
        <span
          class={`impl-chip impl-${implementation}`}
          title="Whether the software this page describes exists yet"
        >
          {IMPLEMENTATION_LABELS[implementation]}
        </span>
      )}
      {counted.map((value) => (
        <span
          class={`impl-chip impl-${value}`}
          title={`Pages in this folder whose software is ${IMPLEMENTATION_LABELS[value]}`}
        >
          {summary![value]} {IMPLEMENTATION_LABELS[value]}
        </span>
      ))}
      <span class={`verification ${approvals.length > 0 ? "verified" : "not-verified"}`}>
        {verification}
      </span>
    </div>
  )
}

StatusBadge.css = `
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin: 0.4rem 0 0.8rem 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.status-badge > span {
  border-radius: 4px;
  padding: 0.12rem 0.45rem;
  font-weight: 600;
}

.status-badge .type-chip {
  background: var(--lightgray);
  color: var(--darkgray);
}

/* Filled: the status is the first thing a reader should judge the page by. */
.status-badge .status-chip {
  background: var(--chip);
  color: var(--chip-ink);
  font-weight: 700;
}

.status-chip.status-active { --chip: ${STATUS_COLORS.active}; --chip-ink: ${STATUS_INK.active}; }
.status-chip.status-draft { --chip: ${STATUS_COLORS.draft}; --chip-ink: ${STATUS_INK.draft}; }
.status-chip.status-slop { --chip: ${STATUS_COLORS.slop}; --chip-ink: ${STATUS_INK.slop}; }
.status-chip.status-superseded { --chip: ${STATUS_COLORS.superseded}; --chip-ink: ${STATUS_INK.superseded}; }
.status-chip.status-dropped { --chip: ${STATUS_COLORS.dropped}; --chip-ink: ${STATUS_INK.dropped}; }

/* Filled like a status, because it is a call to act: somebody has to decide. */
.status-badge .undecided-chip {
  background: ${UNDECIDED_COLOR};
  color: ${UNDECIDED_INK};
  font-weight: 700;
}

/* Outlined and washed, so it never reads as part of the status label. The
   text stays var(--dark), which keeps any accent legible on both themes. */
.status-badge .impl-chip {
  background: var(--impl-wash);
  color: var(--dark);
  border: 1px solid var(--impl);
}

.impl-chip.impl-planned { --impl: ${IMPLEMENTATION_COLORS.planned}; --impl-wash: ${IMPLEMENTATION_TINTS.planned}; }
.impl-chip.impl-partial { --impl: ${IMPLEMENTATION_COLORS.partial}; --impl-wash: ${IMPLEMENTATION_TINTS.partial}; }
.impl-chip.impl-built { --impl: ${IMPLEMENTATION_COLORS.built}; --impl-wash: ${IMPLEMENTATION_TINTS.built}; }

.status-badge .verification.verified {
  background: ${STATUS_COLORS.active};
  color: ${STATUS_INK.active};
}

/* An empty slot rather than a claim. */
.status-badge .verification.not-verified {
  border: 1px dashed var(--gray);
  color: var(--darkgray);
}

/* The chip as a button, once /api/status says the deployment supports it. */
.status-badge .status-chip.status-editable {
  cursor: pointer;
}

.status-badge .status-chip.status-editable::after {
  content: " ▾";
  font-weight: 400;
}

.status-badge .status-chip.status-editable:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

#wiki-status-menu {
  position: absolute;
  z-index: 1000;
  width: min(20rem, calc(100vw - 24px));
  padding: 0.35rem;
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  font-size: 0.85rem;
}

#wiki-status-menu .wiki-status-option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.35rem 0.4rem;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--dark);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

#wiki-status-menu .wiki-status-option:hover,
#wiki-status-menu .wiki-status-option:focus-visible {
  background: var(--lightgray);
}

#wiki-status-menu .status-chip,
#wiki-status-menu .wiki-status-approve {
  flex: none;
  min-width: 5.5rem;
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-align: center;
  background: var(--chip);
  color: var(--chip-ink);
}

#wiki-status-menu .wiki-status-approve {
  background: ${STATUS_COLORS.active};
  color: ${STATUS_INK.active};
}

#wiki-status-menu .wiki-status-note {
  color: var(--darkgray);
}

#wiki-status-menu .wiki-status-confirm:not(:empty) {
  margin-top: 0.35rem;
  padding: 0.5rem 0.4rem 0.2rem;
  border-top: 1px solid var(--lightgray);
}

#wiki-status-menu p {
  margin: 0 0 0.4rem;
}

#wiki-status-menu .wiki-status-message {
  margin: 0.3rem 0.4rem 0.1rem;
  color: var(--darkgray);
}

#wiki-status-menu .wiki-status-message:empty {
  display: none;
}

#wiki-status-menu .wiki-status-input {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 0.4rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--lightgray);
  border-radius: 4px;
  background: var(--light);
  color: var(--dark);
  font: inherit;
}

#wiki-status-menu .wiki-status-actions {
  display: flex;
  gap: 0.4rem;
}

#wiki-status-menu .wiki-status-actions button {
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--lightgray);
  border-radius: 4px;
  background: var(--light);
  color: var(--dark);
  font: inherit;
  cursor: pointer;
}

#wiki-status-menu .wiki-status-actions .wiki-status-go {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--light);
}
`

StatusBadge.afterDOMLoaded = script

export default (() => StatusBadge) satisfies QuartzComponentConstructor
