# CLAUDE.md

This folder is **Silica**, a reusable wiki system: Quartz v4 plus a page status model (`slop` / `implementation` / `approved_by`), a content lint, convention pages and Claude Code files. It is either the Silica repo itself or a copy of it that a project pulled into a subfolder (usually `wiki/`) with git's subtree merge. `README.md` covers adoption, updates and deployment.

**Who owns what.** A project owns `content/` (except `content/meta/`), `silica.config.json` and the site settings in `quartz.config.ts`. Everything else here belongs to Silica: the engine, the badge, `scripts/`, `content/meta/` and `claude/`. In a project, change those in the Silica repo and pull them in, never in place; a local edit comes back as a merge conflict on the next pull. In the Silica repo, `content/` holds only `meta/` and a placeholder `index.md`, never project content, and no `silica.config.json` is shipped.

Writing wiki pages follows the project's wiki rules (the `wiki-writer` skill and `.claude/silica/WIKI.md`, installed by `scripts/install-claude.sh`). The notes below are for changing Silica itself.

- **`claude/` is templates.** The skill, agents and `WIKI.md` use `{{PROJECT}}` and `{{WIKI}}`, filled in by `scripts/install-claude.sh`. Never hard-code a project name or path there.
- **The status model is the product.** A change to it touches `content/meta/status-model.md`, `content/meta/format-standard.md`, `scripts/lint-wiki.mjs`, `quartz/util/wiki.ts`, the badge and the `claude/` templates together, in one commit.
- Every file stays under 1000 lines.
- Commits and PRs carry no Claude co-author trailer or "Generated with Claude Code" line.
- Before committing: `npx tsc --noEmit`, `node scripts/lint-wiki.mjs --strict`, `npx quartz build`.
- Quartz is the `upstream` remote (branch `v4`) in the Silica repo; `git merge upstream/v4` brings in its updates.
