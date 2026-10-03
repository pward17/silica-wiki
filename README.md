# Silica

A wiki system for projects where coding agents write and humans verify. Silica is [Quartz v4](https://quartz.jzhao.xyz) plus:

- **Three page signals** in the frontmatter, rendered as a badge under every title:
  - `status`: `slop` (machine-written, unread by any human), `draft`, `active`, `open` (undecided decision), `superseded`.
  - `implementation`: `planned`, `partial`, `built`: whether the software the page describes exists.
  - `approved_by`: which humans read the page, and when. Only humans write it.
- **A lint** (`scripts/lint-wiki.mjs`) enforcing the page contract: frontmatter, resolvable wikilinks, dated footnotes and open questions, `PLANNED:` markers, no approvals on slop, a line limit.
- **Meta pages** (`content/meta/`) documenting the conventions: status model, format standard, decision template, folder entry pages.
- **Claude Code files** (`claude/`): the `wiki-writer` skill, the `wiki-reader` and `wiki-writer` subagents, and the wiki rules for a project's `CLAUDE.md`.

## Add Silica to a project

From the project's repo root, with the wiki going into `wiki/`:

```
git remote add silica https://github.com/pward17/silica.git
git fetch silica
git read-tree --prefix=wiki/ -u silica/main
git commit -m "Add the wiki from Silica"
cd wiki && npm ci && cd ..
wiki/scripts/install-claude.sh "<Project name>"
```

Then:

1. Add `@.claude/silica/WIKI.md` to the project's `CLAUDE.md`, so Claude reads the wiki rules.
2. Set `pageTitle` and `baseUrl` in `wiki/quartz.config.ts`.
3. Replace `wiki/content/index.md` with the project's front page, and add the project's folders.
4. Optionally create `wiki/silica.config.json` (Silica never ships one, so it never conflicts):
   ```json
   { "implementationFolders": ["technical/", "product/"], "maxLines": 999 }
   ```
   `implementationFolders` are the folders whose pages must say whether their software is built. These are the defaults.

## Pull Silica updates into a project

```
git fetch silica
git merge -X subtree=wiki silica/main
wiki/scripts/install-claude.sh "<Project name>"
```

The project owns `wiki/content/` (except `content/meta/`), `wiki/silica.config.json` and the site settings in `wiki/quartz.config.ts`. Everything else belongs to Silica: change it here, then pull it into each project. A project that edits Silica's files locally will meet those edits again as merge conflicts.

## Deploy on Cloudflare Pages

Root directory `wiki`, build command `npx quartz build`, output directory `public`, build watch paths `wiki/*`. Node 22 comes from `.node-version`. Gate the site with Cloudflare Access on both the custom domain and the `*.pages.dev` address.

## Pull Quartz updates into Silica

Silica keeps Quartz's history, with Quartz as the `upstream` remote:

```
git fetch upstream
git merge upstream/v4
```

## Working on Silica

`npm ci`, then `npx quartz build --serve` previews the meta pages and `node scripts/lint-wiki.mjs --strict` lints them. Keep project-specific content out: Silica's own pages are only the conventions, and everything in `claude/` uses the `{{PROJECT}}` and `{{WIKI}}` placeholders that `install-claude.sh` fills in.

Quartz is MIT licensed; see `LICENSE.txt`.
