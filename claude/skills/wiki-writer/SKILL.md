---
name: wiki-writer
description: Write, edit or review a page in the {{PROJECT}} wiki ({{WIKI}}/content/) without AI slop. Use whenever creating a page, changing one, updating the wiki after a code change, recording a decision or an open question, or reviewing a page before a human promotes it. Covers the procedure (context first, one fact on every page, slop status, implementation from the code, lint, review list), the house voice, and the tells to strip.
---

# Writing to the {{PROJECT}} wiki

The wiki lives in `{{WIKI}}/content/` and is rendered by Quartz. Its audience is a teammate at the next desk who needs the answer, and a coding agent that will act on what a page claims. Both are hurt by the same thing: text that sounds authoritative and says nothing checkable.

The rules this skill applies are specified in `{{WIKI}}/content/meta/format-standard.md` (page contract, footnotes, wikilinks, diagrams, audit checklist) and `{{WIKI}}/content/meta/status-model.md` (status, implementation, approved_by). Read them once per session before your first write.

## The procedure

Follow it in order. Every skipped step has produced a wrong page somewhere.

1. **Get the person's knowledge first.** If a person asked for the page, ask them to dump everything they know, unstructured. Then read what the wiki and the code already say. Only then ask questions, and only the ones that reading produced ("page X says the opposite", "the code does this instead"). Generic questions ("who is the audience?") get generic answers.
2. **Take full context before any edit.** Read the page top to bottom, its folder `index.md`, the pages it links to, the pages that link to it (`grep -rl "\[\[<page-name>" {{WIKI}}/content/`), and `git log --follow -p -3 -- <file>`. A sentence that looks wrong alone is often answered two sections down or on the neighbouring page.
3. **Find every page that states the fact.** Grep `{{WIKI}}/content/` for the claim: the number, the name, the rule, and its paraphrases. Every page that states it or leans on it changes in the same commit, or none does. The wiki must never say two things.
4. **Check claims against the code.** Anything verifiable against the code (the project's CLAUDE.md says where it lives), the database or a real run gets verified. A claim about intent ("we will build X") is sourced to whoever said it, not searched for in code. When a person's account and the code disagree, put the disagreement on the page, don't quietly pick a side.
5. **Write.** Edit with exact fragment replacements (the Edit tool), never by regenerating a whole page: a regenerated page loses the sentences a human already fixed. New pages follow the skeleton for their `type:` in the format standard; decisions copy `{{WIKI}}/content/meta/decision-template.md`.
6. **Set the frontmatter honestly.**
   - `status: slop` on every page you create or substantially rewrite, and delete its `approved_by`: the vouch applied to the old text. A small factual correction on a reviewed page keeps its status, but say so in the review list.
   - Never set `approved_by`, never promote a page, never move a page from `slop` to anything else. Only a human does that.
   - `implementation:` (in the implementation folders: `technical/` and `product/` unless `{{WIKI}}/silica.config.json` lists others) comes from reading the code, never from the page. Re-read it on every edit. On a `partial` page every unbuilt paragraph starts with `PLANNED:`.
   - `title:` is a name of one to four words, three or fewer where possible: `Hosting`, not `Sites run on one Hetzner box in Ashburn`. What the page says about the subject belongs in `description:`. On a decision page the title names the question, not the answer.
   - `updated:` is today.
7. **Run the gates and fix what they flag.**
   ```
   node {{WIKI}}/scripts/lint-wiki.mjs --strict   # frontmatter, links, footnote dates, open-question dates, line limit
   ```
   Also run any other checks the project's CLAUDE.md lists for wiki changes.
   If a page has a Mermaid block, preview it (`cd {{WIKI}} && npx quartz build --serve`) and look at it in both themes, or say in the review list that you could not.
8. **Do not commit unless asked.** Hand back the changes for a human to read. A commit, when asked for, follows the project's CLAUDE.md on commit messages and attribution.
9. **Close with the review list**, every time, without being asked:
   - each page changed, with one line on what changed there and its status after the change;
   - each page read and left alone because it already agreed;
   - every claim you could not verify, and every question you added under `## Open questions`.

## The three questions before every sentence

1. **Is it checkable?** A claim about the system needs a source: a dated footnote, or a link to the code or a decision page. If you cannot check it, write `TODO(<name>): unverified` and leave the claim out. Never invent a number, a path, a limit or a name.
2. **Is it why, not just what?** The code says what it does. The wiki carries what code cannot: why this design, what was rejected, what breaks if you change it.
3. **Would it survive a year?** Session narration, ticket numbers, branch names, build status and today's counters rot in place. Norm goes in the body, provenance in a dated footnote, a gap between intent and reality in a dated `## Open questions` bullet.

## Open questions and candour

A page that names its own gaps beats a smooth one that hides them.

- An unresolved question is a dated bullet under `## Open questions`: what is undecided, what it blocks, who could close it if known.
- Turn vague words into questions. "Soon", "later", "phase 2", "we will probably" each hide a date, an owner or a decision.
- If what you are documenting looks wrong, fragile, or already solved elsewhere, say so to the person before writing it up, then record their decision with a dated footnote.
- Separate "nobody knows" from "nobody wrote it down" from "someone knows and I did not ask".

## The voice

Explain it the way you would to a colleague out loud. Short words. Lead with the answer, then the detail. One idea per paragraph. Claim-style prose in the present tense: "The content API reads from Redis and falls back to PostgreSQL", not "This service can be considered a robust component that facilitates content delivery".

Concrete beats complete. One thing explained properly is worth more than five mentioned.

Never use an em dash. Use a colon, a comma, parentheses or a full stop.

## What to strip

Load `references/phrases.md` for the vocabulary tells (delve, tapestry, "in the realm of", utilize, leverage, robust) and `references/structures.md` for the structural ones (the "not X, it's Y" pivot, the rule of three, hollow openers and closers, process narration, vague attribution, hedge cascades). The two that matter most here:

- **Vague attribution.** "It is generally understood", "the team decided" with nobody named and nothing linked. Name the source or drop the claim.
- **Inflated importance.** "This is a critical component that plays a vital role." Say what it does and what breaks without it.

## The self-critique pass

After drafting, reread once with one question: **what on this page could a reader not check, and what would I be embarrassed to have a teammate quote back to me?** Fix those, then stop. Polish is where slop gets added, not removed.

## After a code change

When a change in a code repo alters something a page claims (an endpoint, a limit, a service boundary, whether a feature exists), the wiki update belongs in the same piece of work. Finish the actual task first, then offer the wiki update in one line, or make it if the person already asked. Flip `implementation:` when the code says so, which clears `approved_by` (see status-model).
