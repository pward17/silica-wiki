// What the isolate remembers between requests about the open comments.
//
// The list is read on every page view by everyone, so it is held for a short
// while. Anything that changes it (a new comment, a reply, a resolve) clears
// it, so the person who acted sees the result on the next load. GitHub also
// answers a list for a moment after a close as if nothing happened, so the
// numbers resolved here are remembered and filtered out until that passes.

const LIST_TTL_MS = 30 * 1000
const RESOLVED_TTL_MS = 60 * 1000

let list = { at: 0, items: null }
const resolved = new Map()
const created = new Map()

export function cachedList() {
  return list.items && Date.now() - list.at < LIST_TTL_MS ? list.items : null
}

export function rememberList(items) {
  list = { at: Date.now(), items }
}

export function clearList() {
  list = { at: 0, items: null }
}

export function rememberResolved(number) {
  resolved.set(number, Date.now())
  clearList()
}

// Same lag in the other direction: a comment filed a moment ago may not be in
// GitHub's list yet, so the summary is kept and merged in until it is.
export function rememberCreated(summary) {
  created.set(summary.number, { at: Date.now(), summary })
  clearList()
}

// The list as it should read right now: fresh creates added, fresh resolves
// removed, both forgotten once GitHub has had time to catch up.
export function reconcile(items) {
  const now = Date.now()
  for (const [number, at] of resolved) {
    if (now - at > RESOLVED_TTL_MS) resolved.delete(number)
  }
  for (const [number, entry] of created) {
    if (now - entry.at > RESOLVED_TTL_MS) created.delete(number)
  }
  const listed = new Set(items.map((item) => item.number))
  const missing = [...created.values()]
    .map((entry) => entry.summary)
    .filter((summary) => !listed.has(summary.number))
  return [...items, ...missing].filter((item) => !resolved.has(item.number))
}
