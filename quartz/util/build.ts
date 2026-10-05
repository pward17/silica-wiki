import { execSync } from "child_process"

// What the build knows about the repository it was built from. A comment filed
// against a page is only useful if it says which version of the page the
// reader was looking at, and which file in the repository that is; the build
// is the only place that knows either.
let commit: string | undefined
let prefix: string | undefined

function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return undefined
  }
}

export function buildCommit(): string | undefined {
  if (commit === undefined) commit = process.env.GITHUB_SHA?.trim() || git("rev-parse HEAD") || ""
  return commit || undefined
}

// A page's path from the repository root. Quartz knows it from the wiki
// folder (content/a.md); a project that keeps the wiki in a subfolder needs
// that folder in front (wiki/content/a.md) for links into the repository.
export function repoPath(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined
  if (prefix === undefined) prefix = git("rev-parse --show-prefix") ?? ""
  return `${prefix}${filePath}`
}
