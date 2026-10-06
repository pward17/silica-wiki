---
title: "Decision template"
type: concept
status: slop
created: 2026-10-02
updated: 2026-10-06
description: "Copyable skeleton and rules for decision pages: the H1 is the decision, lettered options, append-only revisions."
---


A decision page records an architectural or product choice with its alternatives. It lives in the topical folder of its domain; `type: decision` is what makes it discoverable across folders. Every decision automatically appears on the [/tags/decision](/tags/decision) cross-cut, so no `decisions/` folder exists.

Create a decision page **at the first doubt**, not at resolution. Doubts are concrete when they arise and easy to write; converged decisions get postponed and lose exactly the liveliest material: the alternatives, what repelled you, the missing signals. An *open question* (an epistemic gap, a bullet on any page) is distinct from an *undecided decision* (options known, choice pending): a decision page with no `## Chosen` section, which its badge marks `undecided`.

## Skeleton

```markdown
---
type: decision
status: slop | draft | active | superseded | dropped
updated: YYYY-MM-DD
created: YYYY-MM-DD
description: "..."
---

# <The decision stated as ONE sentence>        ← the H1 IS the decision, not the topic

## Context
Why the question arose, what constrains it.

## Options considered

### (A) <name>                                 ← letter prefix ALWAYS, even with 2 options
One-line description (skip if the name suffices).
**Pros:** one aspect per bullet; quantify tradeoffs.
**Cons:** symmetry with pros is not enforced.

### (B) <name>
...

## Chosen: (X), short summary                 ← while undecided, replace this section with
## Why                                         ##   "What is needed to resolve"

## Consequences

## Open questions

## Related

[^slug]: Title, YYYY-MM-DD, URL : comment.
```

## Rules

- Decision pages are **append-only**: a revision adds a `### (C)` option or a note line ("Initial LLM recommendation: B. Curator rejected it and chose A."), never rewrites history.
- Decisions are about *where responsibility lives in the system*, not how code is written. Reframe implementation questions as "at which stage does the responsibility for X live".
- The decision page is the single source of rationale; other pages cite it in one line instead of duplicating the "why".
- **A decision never becomes the description of what was built.** Once the choice is built, what exists gets an entity or concept page. A big decision stays and that page cites it; a small one folds into that page's `## Why` and is set `superseded`. A decision that stops mattering is set `dropped`. The full lifecycle is in [[status-model]].
- On a decision page, the revision date and actor are content (the exception to the no-bookkeeping rule); ticket handles still go to footnotes.

## Related

- [[format-standard]]: general page rules this template extends.
- [[status-model]]: status, the undecided chip and `superseded`.
