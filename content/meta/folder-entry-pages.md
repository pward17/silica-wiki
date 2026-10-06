---
title: "Folder entry pages"
type: concept
status: slop
created: 2026-10-02
updated: 2026-10-06
description: "What a folder's index.md must do: name the load-bearing pages, the traps, and a reading order, never enumerate everything."
---


The engine renders a folder page as the folder's `index.md` body followed by an auto-generated list of every page in the folder (title, date and tags), sorted by date. The entry page therefore **names the load-bearing pages, the traps, and a reading order, and never enumerates everything**:

- The exhaustive list is already machine-drawn and cannot fall behind; a hand-written list starts lying within weeks, and the lie sits right next to the true auto-list.
- The build state is machine-drawn too: the badge under the title counts the pages' `implementation:` values, so the entry page states no build state of its own for the folder.
- The machine cannot provide reading order (date sort teaches nothing: yesterday's stub outranks the most-linked page), cannot say what is load-bearing, and cannot flag traps (a stub looks like any other entry), and shows no status or description, so nothing in the list says which pages to trust.

## Operating rules

- Load-bearing pages are first ranked by inbound-wikilink count, then confirmed by reading. The count ranks, the reading decides.
- Traps are named explicitly: a page that contradicts its neighbor, describes code that no longer exists, or carries a stale status.
- Ordering in the text is semantic; writing the entry requires reading the whole folder.
- **Two levels by default.** A large folder groups its pages via sections of its entry page instead of growing sub-sub-folders. A third level is earned only where one subject has three or more pages of its own.
- New folders are created only when their first real page exists.
- Each folder gets an `attachments/` subfolder for embedded files when needed.

## Acceptance checks

- Every link in the entry resolves.
- Every page in the folder has a non-empty `description:`. It is the page's summary in search engines and link previews, and the entry page draws on it for the pages it names; a weak description is a folder defect.

## Related

- [[format-standard]]: the `index` page type definition.
