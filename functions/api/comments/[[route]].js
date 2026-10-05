// Open comments, read back onto the pages they were left on.
//
//   GET  /api/comments                 every open comment, for the page to anchor
//   GET  /api/comments/:n              one comment with its thread
//   POST /api/comments/:n/reply        add to the thread
//   POST /api/comments/:n/resolve      close it
//
// GitHub Issues stay the record. Resolving here closes the issue, closing the
// issue anywhere else removes the highlight: the page and the queue an agent
// works from cannot disagree.

import { readerEmail } from "../../../lib/comments/access.js"
import { github, isConfigured } from "../../../lib/comments/github.js"
import {
  LABEL,
  MAX_BODY,
  commentText,
  excerptOf,
  parseMeta,
  replyBody,
  replyMeta,
  replyText,
  resolveBody,
  speaker,
} from "../../../lib/comments/format.js"
import { json } from "../../../lib/comments/respond.js"
import {
  cachedList,
  clearList,
  reconcile,
  rememberList,
  rememberResolved,
} from "../../../lib/comments/cache.js"

function summary(issue) {
  const meta = parseMeta(issue.body) || {}
  return {
    number: issue.number,
    url: issue.html_url,
    path: meta.path || "",
    lines: meta.lines || "",
    commit: meta.commit || "",
    quote: meta.quote || "",
    author: speaker(issue.body, issue.user),
    created: issue.created_at,
    text: commentText(issue.body),
    replies: issue.comments || 0,
  }
}

async function openComments(env) {
  const cached = cachedList()
  if (cached) return reconcile(cached)
  const issues = await github(
    env,
    "GET",
    `/issues?labels=${LABEL}&state=open&per_page=100&sort=created&direction=asc`,
  )
  // The issues endpoint also returns pull requests.
  const items = issues.filter((issue) => !issue.pull_request).map(summary)
  rememberList(items)
  return reconcile(items)
}

// Only issues the site filed are reachable here, so this cannot be used to
// touch anything else in the repository. A number that is not an issue at all
// is the same answer as one the site did not file.
async function readerComment(env, number) {
  let issue
  try {
    issue = await github(env, "GET", `/issues/${number}`)
  } catch (err) {
    // 404 is a number that does not exist; 403 is a pull request the app has
    // no permission to read. Neither is something the site filed.
    if (err.status === 404 || err.status === 403) return null
    throw err
  }
  const labelled = (issue.labels || []).some((label) => label.name === LABEL)
  return labelled && !issue.pull_request ? issue : null
}

function entry(reply) {
  return {
    id: reply.id,
    who: speaker(reply.body, reply.user),
    when: reply.created_at,
    text: replyText(reply.body),
    replyTo: replyMeta(reply.body),
  }
}

async function thread(env, issue) {
  const replies = await github(env, "GET", `/issues/${issue.number}/comments?per_page=100`)
  return {
    ...summary(issue),
    state: issue.state,
    thread: replies.map(entry),
  }
}

// What a reply points at: the opening comment (id 0) or one reply in the same
// thread. Looked up here rather than taken from the browser, so nobody can
// put words under someone else's address.
async function replyTarget(env, issue, id) {
  if (id === 0) {
    return {
      id: 0,
      who: speaker(issue.body, issue.user),
      excerpt: excerptOf(commentText(issue.body)),
    }
  }
  let target
  try {
    target = await github(env, "GET", `/issues/comments/${id}`)
  } catch (err) {
    if (err.status === 404 || err.status === 403) return null
    throw err
  }
  if (!target.issue_url || !target.issue_url.endsWith(`/issues/${issue.number}`)) return null
  return { id, who: speaker(target.body, target.user), excerpt: excerptOf(replyText(target.body)) }
}

export async function onRequest(context) {
  const { request, env, params } = context
  const route = Array.isArray(params.route) ? params.route : []

  if (!isConfigured(env)) {
    return json(503, { error: "Comments are not configured yet." })
  }

  const number = route[0] ? Number(route[0]) : null
  if (route.length > 0 && (!Number.isInteger(number) || number <= 0)) {
    return json(404, { error: "No such comment." })
  }

  try {
    if (request.method === "GET" && route.length === 0) {
      // Who is asking rides along, so the page can mark the reader's own
      // messages. A missing identity is not an error for a read.
      const identity = await readerEmail(request, env)
      return json(200, { comments: await openComments(env), me: identity.email || "" })
    }

    if (request.method === "GET" && route.length === 1) {
      const issue = await readerComment(env, number)
      if (!issue) return json(404, { error: "No such comment." })
      return json(200, await thread(env, issue))
    }

    if (request.method === "POST" && route.length === 2) {
      const identity = await readerEmail(request, env)
      if (identity.error) {
        return json(identity.error.status, { error: identity.error.message })
      }
      const issue = await readerComment(env, number)
      if (!issue) return json(404, { error: "No such comment." })

      if (route[1] === "reply") {
        let payload
        try {
          payload = await request.json()
        } catch {
          return json(400, { error: "Expected JSON." })
        }
        const text = String(payload.text || "")
          .trim()
          .slice(0, MAX_BODY)
        if (!text) return json(400, { error: "The reply is empty." })
        let target = null
        if (payload.replyTo !== null && payload.replyTo !== undefined) {
          const id = Number(payload.replyTo)
          if (!Number.isInteger(id) || id < 0) {
            return json(400, { error: "That message is not in this thread." })
          }
          target = await replyTarget(env, issue, id)
          if (!target) return json(400, { error: "That message is not in this thread." })
        }
        const reply = await github(env, "POST", `/issues/${number}/comments`, {
          body: replyBody(identity.email, text, target),
        })
        clearList()
        return json(200, entry(reply))
      }

      if (route[1] === "resolve") {
        await github(env, "POST", `/issues/${number}/comments`, {
          body: resolveBody(identity.email),
        })
        await github(env, "PATCH", `/issues/${number}`, {
          state: "closed",
          state_reason: "completed",
        })
        rememberResolved(number)
        return json(200, { number, state: "closed" })
      }
    }

    return json(404, { error: "No such comment." })
  } catch (err) {
    if (err.status === 403 || err.status === 404) {
      return json(502, {
        error:
          "The wiki bot cannot work with issues on the repository. It needs the Issues permission.",
      })
    }
    return json(502, { error: `GitHub did not answer: ${err.message}` })
  }
}
