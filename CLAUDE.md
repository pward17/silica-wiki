# CLAUDE.md

This repo is **Silica**, a reusable wiki system: Quartz v4 plus a page status model (`slop` / `implementation` / `approved_by`), a content lint, convention pages and Claude Code files. Projects pull it into a subfolder (usually `wiki/`) with git's subtree merge. `README.md` describes adoption, updates and deployment.

- **No project content.** Silica's `content/` holds only `meta/` (the conventions) and a placeholder `index.md`. Examples in meta pages stay generic.
- **`claude/` is templates.** The skill, agents and `WIKI.md` use `{{PROJECT}}` and `{{WIKI}}`, filled in by `scripts/install-claude.sh` when a project installs them. Never hard-code a project name or path there.
- **Projects own** `content/` (except `meta/`), `silica.config.json` (never ship one here) and the site settings in `quartz.config.ts`. Avoid changing those in Silica: every change becomes a merge conflict in each project.
- **The status model is the product.** A change to it touches `content/meta/status-model.md`, `content/meta/format-standard.md`, `scripts/lint-wiki.mjs`, `quartz/util/wiki.ts`, the badge and the `claude/` templates together, in one commit.
- Every file stays under 1000 lines.
- Commits and PRs carry no Claude co-author trailer or "Generated with Claude Code" line.
- Before committing: `npx tsc --noEmit`, `node scripts/lint-wiki.mjs --strict`, `npx quartz build`.
- Quartz is the `upstream` remote (branch `v4`); `git merge upstream/v4` brings in its updates.
