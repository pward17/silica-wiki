---
title: "Decision template"
type: concept
status: active
approved_by: [{ who: Patrick Ward, when: 2026-10-06 }]
created: 2026-10-02
updated: 2026-10-06
description: "Copyable skeleton and rules for decision pages: the title names the question, lettered options, the chosen option in its own section, append-only revisions."
---


A decision page records an architectural or product choice with its alternatives. It lives in the topical folder of its domain, next to the pages it affects; `type: decision` is what marks it as a decision, so there is no `decisions/` folder.

Create a decision page **at the first doubt**, not at resolution. Doubts are concrete when they arise and easy to write; converged decisions get postponed and lose exactly the liveliest material: the alternatives, what repelled you, the missing signals. An *open question* (an epistemic gap, a bullet on any page) is distinct from an *undecided decision* (options known, choice pending): a decision page with no `## Chosen` section, which its badge marks `undecided`.

## Skeleton

```markdown
---
title: "<The question, as a name>"            ← e.g. "Hosting provider"; never the answer
type: decision
status: slop | draft | active | superseded | dropped
implementation: planned | partial | built     ← only inside an implementation folder
updated: YYYY-MM-DD
created: YYYY-MM-DD
description: "..."                            ← the question, and once made, the choice
---

## Context
Why the question arose, what constrains it.

## Options considered

### (A) <name>                                 ← letter prefix ALWAYS, even with 2 options
One-line description (skip if the name suffices).
**Pros:** one aspect per bullet; quantify tradeoffs.
**Cons:** symmetry with pros is not enforced.

### (B) <name>
...

## Chosen: (X), short summary                 ← while undecided, replace Chosen and Why
## Why                                            with one "## What is needed to resolve"

## Consequences

## Open questions

## Related

[^slug]: Title, YYYY-MM-DD, URL : comment.
```

## Rules

- Decision pages are **append-only**: a revision adds a `### (C)` option or a note line ("Initial LLM recommendation: B. The human reviewer rejected it and chose A."), never rewrites history.
- Decisions are about *where responsibility lives in the system*, not how code is written. Reframe implementation questions as "at which stage does the responsibility for X live".
- The title names the question and stays put; the answer lives under `## Chosen:`, so a later supersession changes the section, not the file name.
- The decision page is the single source of rationale; other pages cite it in one line instead of duplicating the "why".
- **A decision never becomes the description of what was built.** Once the choice is built, what exists gets an entity or concept page. A big decision stays and that page cites it; a small one folds into that page's `## Why` and is set `superseded`. A decision that stops mattering is set `dropped`. The full lifecycle is in [[status-model]].
- On a decision page, the revision date is content (the exception to the no-bookkeeping rule). Who decided goes in a dated footnote, as everywhere else, and so do ticket handles.

## Related

- [[format-standard]]: general page rules this template extends.
- [[status-model]]: status, the undecided chip and `superseded`.
