---
title: "Format standard"
type: concept
status: slop
created: 2026-10-02
updated: 2026-10-06
description: "The operational spec for writing wiki pages: frontmatter contract, page types, editorial doctrine, footnotes, wikilinks, diagrams, and the audit checklist of forbidden patterns."
---


This page is the single source of the wiki's writing rules. It doubles as an audit checklist. Templates live in exactly one place each. This page links to them, never duplicates them.

## Frontmatter contract

```yaml
---
title: "Page title"          # the H1 comes from here; pages never start with a markdown H1;
                             # aim for a noun phrase of 1-4 words, see "Titles" below
type: entity | concept | decision | index
status: slop | draft | active | open | superseded
implementation: planned | partial | built   # does the SOFTWARE exist? required under
                             # the implementation folders, refused elsewhere
updated: YYYY-MM-DD          # last content revision; drives the date shown on cards
created: YYYY-MM-DD
description: "1-3 factual sentences about what is ON the page (not why it was made);
              shown on folder cards; must not duplicate the body's first paragraph"
tags: []                     # optional, thematic only; the decision axis is type:, never a tag
approved_by:                 # optional review history
  - { who: <handle>, when: YYYY-MM-DD }
superseded_by: "[[wikilink]]"  # REQUIRED iff status: superseded
aliases: [old-file-name]     # kept after renames; the engine emits redirects
---
```

The three axes, and why `status` and `implementation` are never the same question, are specified in [[status-model]]. The short version: `status` is how far along the text is, `implementation` is whether the software exists, and a page is routinely unproofread prose about a live service or a carefully reviewed design for something nobody has built.

## Titles

A title is a name, not a sentence. Aim for a noun phrase of one to four words, three or fewer where possible (`Hosting`, `Client previews`, `Contact form`). It names what the page is about; what the page *says* about it goes in `description:` and the first paragraph. Sentence case, no trailing full stop, no verb clause. This is a strong preference, not a hard rule: a longer title is fine on the rare page where no short name is clear, but that is the exception, not the habit.

- **Wrong:** `Sites run on one Hetzner box in Ashburn with single-node k3s`. **Right:** `Hosting`, with the box, the region and k3s in the description.
- **Decision pages too.** The title names the question (`Hosting provider`, `Auth method`), not the answer: the answer lives in `## Chosen:` and can change by supersession without a rename.
- **Specificity comes from the folder**, not the title: `technical/hosting` does not need "infrastructure" in its title.

The lint warns on a title of more than four words but does not fail (`maxTitleWords` in `silica.config.json` changes the threshold).

## Page types

Four coarse types. Specificity of form lives in the page *name and first line*, never in more enum values.

- **`entity`** is a pointable thing: a service, a pipeline, a vendor, an app, a UI surface. Small (50–150 lines), densely linked. Test: "can you say *that* X, and does it exist or run?"
- **`concept`** is an idea, technique, or taxonomy you apply, not a thing. Thin: it links to entities instead of redefining them.
- **`decision`** is an architectural or product choice (ADR-like). Lives in the topical folder of its domain, **not** a `decisions/` folder; the `type:` field is what binds decisions together. Skeleton: [[decision-template]].
- **`index`** is a folder's entry page. Rules: [[folder-entry-pages]].

There is deliberately no `source` type: external documents get footnotes, never their own page.

## Editorial doctrine: three kinds of information, three homes

A page is a **spec of the norm** (how the thing is designed to be), not a meeting digest.

| Kind | Definition | Home |
|---|---|---|
| **Norm** | how it should be | page body, claim-style prose |
| **Provenance** | when/where it became so | a footnote, which must carry a date |
| **Divergence** | reality currently differs from the norm | a dated bullet under `## Open questions` |

- **No bookkeeping in the body**: ticket and PR numbers, commit SHAs, branch names, run dates identify *work*, not *behavior*, and rot silently in prose. They go to footnotes, where the mandatory date makes staleness visible. Exception: on a decision page the revision date is content; the actor stays in the footnote.
- **Divergence bullets** carry a date (self-expiring) and, once a tracker exists, a ticket handle; the change that closes the gap deletes the bullet in the same motion that edits the norm. Test: stale in a day → incident, belongs in the tracker; a durable intent-vs-implementation gap → divergence, belongs here. Agent readers cannot otherwise tell "intended" from "bug: should I fix this?".
- **A divergence is not an unbuilt feature.** Divergence is for something that exists and behaves differently from the norm, and it scales to a handful of bullets. A page describing something nobody has written yet carries `implementation: planned`, or `partial` with the unbuilt paragraphs marked `PLANNED:`; forty divergence bullets on a design page is the wrong tool. See [[status-model]].
- **A person's name in the body is either the subject or a mistake.** Who *decided* something is provenance and lives in a dated footnote; who *is building* something is bookkeeping and lives in the tracker. `Ada is building the search endpoint` is wrong in the body for the same reason a branch name is: it is true for a fortnight, nobody comes back to correct it, and the page then quietly misinforms. Write what the system will do, footnote who decided it, and let the tracker hold the assignee. Names stay in the body where they are the subject rather than bookkeeping: a page *about* people (who holds which credential, who is the second pair of hands), and a durable component owner answering "who do I ask" ("Ada owns the web frontend"). The test is whether a reassignment tomorrow would make the sentence false: if it would, footnote it. Attribution goes the same way: where two accounts disagree the body carries the disagreement ("two accounts disagree: one says X, the other Y") and the footnotes carry who holds which, because the ideas are what is being weighed and not the people. A decision page records the decision and its date in the body and names the decider in the footnote.
- **`## Open questions` is the one place a name may stand in the text.** It is not the spec part of the page, so a bullet may say whose account is whose, who could close the question, or who is measuring something, and an unowned dependency is named as unowned because that is what sinks a delivery. The body does not: the same fact in a paragraph is a status report that expires.
- **Build state belongs to `implementation:`, not to prose.** Whether the software exists is one frontmatter value and, on a `partial` page, the `PLANNED:` markers; see [[status-model]]. The body does not also narrate it. "Nothing of it is built", "not pushed yet", "as of today this is only a design" are the field's job, and a sentence doing it twice goes stale in one of the two places. What *does* stay in the body is the system's present behaviour, because that is a spec fact: "the API answers with one JSON object when the run ends" tells a reader they cannot stream today and is not a status report.
- **Register**: encyclopedic. No chat tone traveling in with facts from calls; no slogan headings; no invented jargon (a term either exists outside the wiki or is defined in place); verbatim quotes only when exact wording is load-bearing, otherwise synthesize.
- **Anti-pattern** ("digest narrative"): date-anchored lines like "Apr 23: X failed", names inside observations, "decided at standup". The same facts become claim-style prose with footnote markers.

## Section skeletons

- **entity**: 1–3-sentence definition → "Where it lives / how we use it" → aspect sections → "Failure modes" (only if material exists) → "Open questions" → "Related" → footnote definitions (no heading).
- **concept**: context intro → aspect sections → "Open questions" → "Related" → footnote definitions.
- **decision**: see [[decision-template]].
- **`## Related`** is one flat bullet list mixing entities, concepts, and decisions: `- [[page]]: how it relates`, with decision status appended inline (`, **open**`) when worth flagging. A separate "Related decisions" heading is forbidden.

## Wikilinks

- Written as bare unique filenames (`[[page]]`, no folder prefix). The engine resolves them, so moving pages never breaks links. Full paths only for image embeds and same-named pages.
- Embedded in prose via the alias form (`served by the [[content-api|content API]]`), never parenthetical `(see [[X]])`. Bare bullets are fine inside `## Related`.
- Renames: `git mv` plus a search-and-replace over all link forms (`[[old]]`, `[[old|alias]]`, `[[old#Anchor]]`) in one atomic commit; the old name goes into `aliases:` so old URLs survive.

## Footnotes

Every non-obvious fact carries an inline `[^slug]` marker; definitions sit at the end of the file with **no heading** (the engine generates the footnotes block).

- **Slugs are readable, type-prefixed, dated**, never auto-generated: `[^call-2026-08-12]`, `[^session-871a7608]`, `[^spec-cms-hooks]`.
- **Definition format**: `[^slug]: <Title>, <YYYY-MM-DD>, <URL> : <comment>.`
- Two invariants: (1) a **date**, the event date for event-based sources or `accessed YYYY-MM-DD` for living docs; a footnote without a date is invalid. (2) a **where-to-look**, either a URL or an intra-team reference for assistant sessions (`Session <owner>/<sid8>, YYYY-MM-DD : one line on what it was about`).

## Diagrams

A diagram earns its place when the relationship is the point and prose would have to walk the reader through it: who calls whom and what comes back, which status moves are allowed, which branch an agent takes. Four shapes cover nearly everything:

- `sequenceDiagram` for a request crossing services, or the two sides of an integration: the order of calls and what each returns.
- `stateDiagram-v2` for anything with a status column: the values and the moves between them. [[status-model]] carries one.
- `flowchart` for a decision a person or a program makes: the questions and the branches.
- `flowchart` again for a boundary: which side of the front door a component lives on.

Not for a list dressed as boxes, a single arrow, a timeline of meetings, or anything one sentence says as well. A page that needs a diagram to be understood has a diagram; a page that would merely look more finished with one does not.

How they are written:

- A fenced code block with `mermaid` after the opening fence, in the page itself, never an image. It diffs, it renders on GitHub and in the downloaded markdown, and it changes when the page changes instead of rotting in a screenshot.
- **The prose stays the source of truth.** A diagram carries no footnotes and gets no lint, so every fact in it is also in the text with its source. The diagram is a view of the page, not a second page. One sentence before it says what it shows.
- Labels use the page's own names: the CMS by its product name, the API by what the project calls it, the search engine by name. Never "System", "User", "Service A".
- About a dozen nodes at most. Past that the reader is doing the work the diagram was meant to do; split by question instead.
- Left to right for flows, top down for hierarchies. No colours, no styling directives: the theme renders both modes.
- **Look at it before committing, with your own eyes.** Mermaid decides the layout, not the writer. Run `npx quartz build --serve` in `wiki/`, open the page in both themes, and check: it rendered with no error box; it fits the text column without shrinking the labels; no nodes or labels overlap; no edge runs through a node; it is arranged the way the prose describes. When it fails, fix in this order: shorter labels, fewer nodes, the other direction, then split by question.

## Unverified claims

A claim you could not check does not go on the page as prose. Write `TODO(<name>): unverified` in its place, state what is actually known next to it, and move on. The marker is cheap, visible, and greppable, and a page carrying one cannot be promoted past `draft`: the lint fails it on `active` and `open`. This is deliberate, because the alternative is a confident invented specific that a reader or an agent will act on.

Never invent a limit, a path, a field name, a number or a date to fill a gap. An honest gap costs a reader a question; a fabricated fact costs them a debugging session.

## Register and machine tells

Pages are written in plain, checkable English: lead with the answer, one idea per paragraph, present tense. Two mechanical rules: no em dashes (colon, comma, parentheses or full stop instead), and none of the vocabulary and sentence shapes that mark generated text. The full catalogue lives in the `wiki-writer` skill in `.claude/skills/`; the short version is that `delve`, `in the realm of`, `it's not just X, it's Y`, the rule of three, hollow openers and closers, vague attribution (`studies show`) and process narration (`after reviewing the sources`) all get rewritten into the concrete claim they were avoiding.

These are density signals, not proof of authorship: a single flagged word means nothing, three in a paragraph means nobody reread the text. Treat every flag as a nudge to say the concrete thing, never as a verdict about who wrote it.

## Audit checklist (forbidden patterns)

Fact without citation · footnote without a date · a file of 1000 lines or more · inline URLs in the body · bookkeeping in the body · an assignee named in the body ("X is building Y") · a decider or a discoverer named in body prose where a footnote already carries them · build state narrated in prose that `implementation:` already carries · a `## Sources` heading · `(see [[X]])` · date-anchored narrative · the page narrating its own revisions ("the call left X, now Y", "that is gone") · divergence written as prose or a footnote · transient incidents or volatile counters on pages · copying data out of tracker/chat/analytics instead of referencing it · emoji and checkmark noise · horizontal rules as decoration · slogan headings · long verbatim quotes without necessity · retelling sources in full · rewriting a page without reading its pending review comments first · `status: superseded` without `superseded_by` · an empty `description:` · a title that is a sentence · a missing `implementation:` in an implementation folder · an `implementation:` anywhere else · `implementation: partial` with no `PLANNED:` marker saying which parts · a `PLANNED:` marker on a page that is all plan or all built · a shipped-but-broken control written up as unbuilt instead of as a trap · an `implementation:` carried unchanged through an edit that the code has since overtaken.

## Related

- [[status-model]]: the trust axes this standard assumes.
- [[folder-entry-pages]]: the one page type with its own operating rules.
- [[decision-template]]: the skeleton for decision pages.
