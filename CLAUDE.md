# CLAUDE.md

This folder is **Silica Wiki** (Silica for short), a reusable wiki system: Quartz v4 plus a page status model (`slop` / `implementation` / `approved_by`), a content lint, convention pages and Claude Code files. It is either the Silica repo itself or a copy of it that a project pulled into a subfolder (usually `wiki/`) with git's subtree merge. `README.md` covers adoption, updates and deployment.

**Who owns what.** A project owns `content/` (except `content/meta/`), `silica.config.json` and the site settings in `quartz.config.ts`. Everything else here belongs to Silica: the engine, the badge, reader comments (`functions/`, `lib/`), `scripts/`, `content/meta/` and `claude/`. In a project, change those in the Silica repo and pull them in, never in place; a local edit comes back as a merge conflict on the next pull. In the Silica repo, `content/` holds only `meta/` and a placeholder `index.md`, never project content, and no `silica.config.json` is shipped.

Writing wiki pages follows the project's wiki rules (the `wiki-writer` skill and `.claude/silica/WIKI.md`, installed by `scripts/install-claude.sh`). In the Silica repo itself, run `scripts/install-claude.sh "Silica Wiki"` once to get the skill and agents for editing `content/meta/`; the output is gitignored. The notes below are for changing Silica itself.

## Changing Silica

- **`claude/` is templates.** The skill, agents and `WIKI.md` use `{{PROJECT}}`, `{{WIKI}}` and `{{REPO}}`, filled in by `scripts/install-claude.sh`. Never hard-code a project name or path there.
- **The status model is the product.** A change to it touches `content/meta/status-model.md`, `content/meta/format-standard.md`, `scripts/lint-wiki.mjs`, `quartz/util/wiki.ts`, the badge and the `claude/` templates together, in one commit.
- **The meta pages are reviewed pages.** They follow their own rules: edit by fragment, and a substantial rewrite sets the page back to `slop` and clears `approved_by`. Only a human promotes a page or adds an approval.
- **Silica is shared and public.** Every project that uses it pulls its full history, so nothing here names, quotes or describes a project, person or organisation that uses it, in files, code comments or commit messages. Describe the case generically ("a project with two sites").
- **No em dashes** in anything written: pages, docs, code comments, commit messages. Use a colon, a comma, parentheses or a full stop.
- Every file stays under 1000 lines.
- Changes go on a branch and reach `main` through a PR.

## Checking a change

```
npm run check            # tsc and Prettier
npm run lint:wiki        # the content lint on content/meta/
npx quartz build         # the site builds
```

- Test a lint or engine change against real content as well as `content/meta/`: copy a project's `content/` into a scratch copy of Silica and run the lint and the build there. The meta pages alone exercise few of the rules.
- A change to how pages render (the badge, a diagram, a layout) gets a look in a browser, in both light and dark themes.
- Quartz is the `upstream` remote (branch `v4`) in the Silica repo; `git merge upstream/v4` brings in its updates.

## Reaching the projects that use it

A change merged to Silica's `main` reaches each project when that project pulls it, on a branch, with a PR like any other change:

```
git fetch silica && git merge -X subtree=wiki silica/main
wiki/scripts/install-claude.sh "<Project name>"
node wiki/scripts/lint-wiki.mjs --strict
```

- Conflicts on files the project owns (the `pageTitle` in `quartz.config.ts`, `content/index.md`) resolve to the project's side.
- A change that tightens the lint can fail pages a project already has. Say so in the Silica PR description, so each project fixes those pages in the same pull.
