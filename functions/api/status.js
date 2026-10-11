// Changing a page's status from the page itself.
//
//   GET  /api/status?path=<repo path>   what the reader may do with this page
//   POST /api/status                    { path, status | approve, commit, supersededBy }
//
// The change is a commit to the default branch that edits only the page's
// frontmatter: status, updated, approved_by and superseded_by. Only people in
// `approvers` in silica.config.json may make one, identified by the signed
// Cloudflare Access token, and going active stamps their name and today's
// date into approved_by. The commit is authored as them, so git blame says
// who vouched. Which moves exist is in lib/status/moves.js.

import { verifiedEmail } from "../../lib/comments/access.js"
import { github, isConfigured } from "../../lib/comments/github.js"
import { json } from "../../lib/comments/respond.js"
import { approverName, fromBase64, wikiRoot } from "../../lib/status/approvers.js"
import {
  joinFrontmatter,
  readApprovals,
  readKey,
  setKey,
  splitFrontmatter,
  writeApprovals,
} from "../../lib/status/frontmatter.js"
import { MOVES, MOVE_NOTES, approvalsAfter, today } from "../../lib/status/moves.js"

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// The same shape check comments use: a Markdown file under some content/.
// content/meta/ belongs to Silica and is promoted by its maintainer by hand.
function pagePathFrom(value) {
  const path = String(value || "").trim()
  if (!/^([\w.-]+\/)*content\/[\w./-]+\.md$/.test(path) || path.includes("..")) return null
  if (path.slice(wikiRoot(path).length).startsWith("content/meta/")) return null
  return path
}

async function currentPage(env, path) {
  let file
  try {
    file = await github(env, "GET", `/contents/${path}`)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
  const text = fromBase64(file.content)
  const front = splitFrontmatter(text)
  return front ? { sha: file.sha, text, front } : null
}

function describe(front, name) {
  const status = readKey(front.lines, "status")
  const approvals = readApprovals(front.lines)
  const moves = (MOVES[status] || []).map((to) => ({ to, note: MOVE_NOTES[to] }))
  const approved = approvals.some((a) => a.who.toLowerCase() === name.toLowerCase())
  return { status, approvals, moves, canApprove: status === "active" && !approved }
}

// The person vouches for the text they read. If the file on the default
// branch is no longer the one the page was built from, they have not read it.
async function readWhatTheyApprove(env, path, sha, commit) {
  if (!commit) return true
  try {
    const built = await github(env, "GET", `/contents/${path}?ref=${commit}`)
    return built.sha === sha
  } catch (err) {
    if (err.status === 404) return false
    throw err
  }
}

// superseded_by is a bare page name, and it has to be a page that exists:
// a dangling one would fail the lint on the default branch.
async function pageExists(env, path, name) {
  const root = `${wikiRoot(path)}content/`
  const repo = await github(env, "GET", "")
  const tree = await github(env, "GET", `/git/trees/${repo.default_branch}?recursive=1`)
  return tree.tree.some(
    (item) =>
      item.type === "blob" && item.path.startsWith(root) && item.path.endsWith(`/${name}.md`),
  )
}

export async function onRequest(context) {
  const { request, env } = context
  if (!isConfigured(env)) return json(503, { error: "Status changes are not configured." })
  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { error: "GET or POST." })
  }

  let payload = {}
  if (request.method === "POST") {
    try {
      payload = await request.json()
    } catch {
      return json(400, { error: "Expected JSON." })
    }
  }
  const path = pagePathFrom(
    request.method === "GET" ? new URL(request.url).searchParams.get("path") : payload.path,
  )
  if (!path) return json(400, { error: "Not a page whose status can change here." })

  try {
    const identity = await verifiedEmail(request, env)
    const name = identity.email ? await approverName(env, path, identity.email) : null
    if (request.method === "GET" && !name) return json(200, { canEdit: false })
    if (identity.error) return json(identity.error.status, { error: identity.error.message })
    if (!name) return json(403, { error: "You are not on this wiki's approver list." })

    const page = await currentPage(env, path)
    if (!page) {
      return json(404, { error: "The page is not on the default branch, or has no frontmatter." })
    }
    const state = describe(page.front, name)
    if (request.method === "GET") return json(200, { canEdit: true, name, ...state })

    const to = payload.approve ? state.status : String(payload.status || "")
    if (payload.approve ? !state.canApprove : !state.moves.some((m) => m.to === to)) {
      return json(409, {
        error: `The page is ${state.status} now, and that change no longer applies. Reload it.`,
      })
    }
    if (to === "active") {
      const rawCommit = String(payload.commit || "").trim()
      const commit = /^[0-9a-f]{7,40}$/.test(rawCommit) ? rawCommit : ""
      if (!(await readWhatTheyApprove(env, path, page.sha, commit))) {
        return json(409, {
          error: "The page has changed since this copy was built. Reload it and read it again.",
        })
      }
    }
    let supersededBy = ""
    if (to === "superseded") {
      supersededBy = String(payload.supersededBy || "")
        .trim()
        .replace(/^\[\[|\]\]$/g, "")
      if (!/^[\w.-]+$/.test(supersededBy) || !(await pageExists(env, path, supersededBy))) {
        return json(400, { error: "Name the page that replaces this one, by its file name." })
      }
    }

    const lines = page.front.lines
    setKey(lines, "status", to)
    setKey(lines, "updated", today(), "created")
    writeApprovals(lines, approvalsAfter(to, state.approvals, name))
    if (supersededBy) setKey(lines, "superseded_by", supersededBy, "status")

    const pageName = path.split("/").pop().replace(/\.md$/, "")
    const message = payload.approve
      ? `status(${pageName}): approved by ${name}`
      : `status(${pageName}): ${state.status} → ${to}`
    await github(env, "PUT", `/contents/${path}`, {
      message,
      content: toBase64(joinFrontmatter(page.front)),
      sha: page.sha,
      author: { name, email: identity.email },
    })
    return json(200, { ...describe(page.front, name), canEdit: true, name })
  } catch (err) {
    // A branch rule (required reviews, required checks) refuses the push
    // outright; the bot's account has to be allowed to bypass it.
    if (/protected branch|rule violation|repository rule/i.test(err.detail || "")) {
      return json(502, {
        error:
          "The default branch refuses direct commits from the wiki bot. Its rules need a bypass.",
      })
    }
    if (err.status === 409) {
      return json(409, { error: "Someone changed the page at the same moment. Reload it." })
    }
    if (err.status === 403 || err.status === 404) {
      return json(502, {
        error: "The wiki bot cannot write to the repository. It needs Contents read and write.",
      })
    }
    return json(502, { error: `GitHub did not answer: ${err.message}` })
  }
}
