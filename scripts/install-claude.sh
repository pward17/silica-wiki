#!/usr/bin/env bash
# Installs Silica's Claude Code files into the project that contains this wiki:
#   <project>/.claude/skills/wiki-writer/   the writing skill
#   <project>/.claude/agents/wiki-*.md      the reader and writer subagents
#   <project>/.claude/silica/WIKI.md        the wiki rules, for the project's CLAUDE.md to import
# Placeholders {{PROJECT}}, {{WIKI}} and {{REPO}} (owner/name of the GitHub
# repository, from the origin remote) are filled in. Rerun after pulling Silica
# updates; it overwrites only the files listed above.
#
# Usage: <wiki-dir>/scripts/install-claude.sh "<Project name>"
set -euo pipefail

if [ $# -lt 1 ] || [ -z "$1" ]; then
  echo "usage: $0 \"<Project name>\"" >&2
  exit 1
fi
project="$1"

wiki_dir="$(cd "$(dirname "$0")/.." && pwd)"
root="$(git -C "$wiki_dir" rev-parse --show-toplevel)"
if [ "$root" = "$wiki_dir" ]; then
  wiki_rel="."
else
  wiki_rel="${wiki_dir#"$root"/}"
fi
repo="$(git -C "$root" remote get-url origin 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
repo="${repo:-<owner>/<repo>}"
src="$wiki_dir/claude"
dest="$root/.claude"

render() { # render <template> <output>
  mkdir -p "$(dirname "$2")"
  PROJECT="$project" WIKI="$wiki_rel" REPO="$repo" perl -pe 's/\{\{PROJECT\}\}/$ENV{PROJECT}/g; s/\{\{WIKI\}\}/$ENV{WIKI}/g; s/\{\{REPO\}\}/$ENV{REPO}/g' "$1" > "$2"
}

rm -rf "$dest/skills/wiki-writer"
while IFS= read -r -d '' f; do
  render "$f" "$dest/${f#"$src"/}"
done < <(find "$src/skills" "$src/agents" -type f -print0)
render "$src/WIKI.md" "$dest/silica/WIKI.md"

echo "Installed Silica's Claude files for \"$project\" (wiki at $wiki_rel/) into $dest"
if ! grep -qs "@.claude/silica/WIKI.md" "$root/CLAUDE.md"; then
  echo "Add this line to $root/CLAUDE.md so Claude reads the wiki rules:"
  echo "  @.claude/silica/WIKI.md"
fi
