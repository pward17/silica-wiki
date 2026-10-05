// Reader comments -> GitHub issues.
//
// A reader selects text on a page, writes a note, and this turns it into one
// issue in the wiki repo labelled `wiki-comment`. Nobody needs a GitHub
// account: Cloudflare Access has already authenticated them, and the identity
// comes from Access itself, never from the request body.

import { readerEmail } from "../../lib/comments/access.js"
import { github, isConfigured, repository } from "../../lib/comments/github.js"
import { LABEL, MAX_BODY, MAX_QUOTE, issueBody } from "../../lib/comments/format.js"
import { json } from "../../lib/comments/respond.js"
import { rememberCreated } from "../../lib/comments/cache.js"

export async function onRequestPost(context) {
  const { request, env } = context

  const identity = await readerEmail(request, env)
  if (identity.error) {
    return json(identity.error.status, { error: identity.error.message })
  }
  if (!isConfigured(env)) {
    return json(503, { error: "Comments are not configured yet." })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: "Expected JSON." })
  }

  const comment = String(payload.comment || "")
    .trim()
    .slice(0, MAX_BODY)
  const quote = String(payload.quote || "")
    .trim()
    .slice(0, MAX_QUOTE)
  const pagePath = String(payload.path || "")
    .trim()
    .slice(0, 300)
  const pageTitle = String(payload.title || "")
    .trim()
    .slice(0, 200)
  const pageUrl = String(payload.url || "")
    .trim()
    .slice(0, 500)
  // Both come from the browser, so both are checked before they end up in a
  // link: a commit is hex, a line range is one number or two.
  const rawCommit = String(payload.commit || "").trim()
  const commit = /^[0-9a-f]{7,40}$/.test(rawCommit) ? rawCommit : ""
  const rawLines = String(payload.lines || "").trim()
  const lines = /^\d{1,7}(-\d{1,7})?$/.test(rawLines) ? rawLines : ""

  if (!comment) {
    return json(400, { error: "The comment is empty." })
  }
  // Relative to the repository root, so a wiki in a subfolder sends wiki/content/...
  if (
    !pagePath ||
    !/^([\w.-]+\/)*content\/[\w./-]+\.md$/.test(pagePath) ||
    pagePath.includes("..")
  ) {
    return json(400, { error: "The page is missing." })
  }

  const title = `[wiki] ${pageTitle || pagePath}: ${comment.split("\n")[0].slice(0, 70)}`
  const body = issueBody({
    pagePath,
    pageTitle,
    pageUrl,
    email: identity.email,
    quote,
    comment,
    commit,
    lines,
    repo: repository(env),
  })

  try {
    const issue = await github(env, "POST", "/issues", { title, body, labels: [LABEL] })
    rememberCreated({
      number: issue.number,
      url: issue.html_url,
      path: pagePath,
      lines,
      commit,
      quote,
      author: identity.email,
      created: issue.created_at,
      text: comment,
      replies: 0,
    })
    return json(200, { url: issue.html_url, number: issue.number, author: identity.email })
  } catch (err) {
    if (err.status === 403 || err.status === 404) {
      return json(502, {
        error: "The wiki bot cannot open issues on the repository. It needs the Issues permission.",
      })
    }
    return json(502, { error: `Could not file the comment: ${err.message}` })
  }
}
