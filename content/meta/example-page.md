---
title: "Example page"
type: entity
status: slop
created: 2026-10-06
updated: 2026-10-06
description: "A worked entity page about an invented website contact form, to copy from. It shows every part the format standard asks for: footnotes, an unverified marker, a trap, dated open questions and a Related list."
---

> [!example] An invented subject
> The contact form, the people and the sources on this page are made up; the structure is the point. Pages in `meta/` may not carry `implementation:`, so the frontmatter leaves it out. In a project this page would be `product/contact-form.md`, titled `Contact form`, with `implementation: partial`, and the automatic acknowledgement in the open questions below would be its own paragraph starting `PLANNED:` (see [[status-model]]). The lint allows that marker only on a page that carries `implementation:`, so here it is described, not shown.

The contact form is the only part of the site that sends visitor data anywhere. A visitor enters a name, an email address and a message; a serverless function checks the request and emails it to the shared inbox. No copy is stored.[^call-2026-09-28]

## Where it lives

The form is static HTML at `/contact`. It posts to `/api/contact`, a Pages Function in the site repository at `functions/api/contact.js`. The function sends mail through the email provider's HTTP API, with the API key held as a secret on the Pages project and never in the repository.[^session-3f9c21ab]

The provider's daily sending cap: TODO(ada): unverified. The free plan has one, and nobody has checked which plan the account is on.

## How a message travels

1. The browser posts the form as JSON.
2. The function refuses a message longer than 5,000 characters, or a request without a valid spam-check token, with a 400.
3. It sends one email to the shared inbox, with the visitor's address as `Reply-To`, so answering the email answers the visitor.
4. It answers 200, and the page replaces the form with a thank-you note.

## Traps

- **A failed send still shows the thank-you note.** The function answers 200 before the email provider confirms the send, so a provider outage loses messages without anyone noticing. The fix is to wait for the provider's answer and show an error when it fails.[^session-7d04e6b1]

## Open questions

- 2026-10-03: Nobody covers the shared inbox when its owner is away, so a message can sit unread for a week. Deciding on a backup reader is Ada's call.
- 2026-10-05: An automatic acknowledgement to the visitor, so they know the message arrived, needs a sending address on the site's domain, which needs DNS records nobody has added. Until then it is not built; whoever holds the DNS login can close it.

## Related

- [[format-standard]]: the entity skeleton, footnote format and audit checklist this page follows.
- [[status-model]]: why the page starts as `slop`, and what `partial` and `PLANNED:` mean.
- [[decision-template]]: the shape the no-storage choice would take as its own decision page.

[^call-2026-09-28]: Call on contact form scope, 2026-09-28, https://example.com/notes/2026-09-28 : Ada decided against keeping a copy of messages, so there is no personal data to secure or delete.
[^session-3f9c21ab]: Session ada/3f9c21ab, 2026-09-30 : built the function and moved the API key into the Pages secrets.
[^session-7d04e6b1]: Session ada/7d04e6b1, 2026-10-02 : found the early 200 while testing with the provider's sandbox switched off.
