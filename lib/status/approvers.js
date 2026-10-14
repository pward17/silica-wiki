// Who may change a page's status from the page, and the name each is stamped
// with. The list is `approvers` in silica.config.json, read from the
// repository's default branch rather than from the build, so adding someone
// is a reviewed commit that takes effect without a redeploy.
//
//   { "approvers": { "someone@example.com": "Their Name" } }

import { github } from "../comments/github.js"

const TTL_MS = 60 * 1000
const cache = new Map()

export const fromBase64 = (value) =>
  new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, "")), (c) => c.charCodeAt(0)))

// The wiki root is whatever sits in front of content/ in a page's path, so a
// project with the wiki in a subfolder reads wiki/silica.config.json.
export function wikiRoot(pagePath) {
  return pagePath.slice(0, pagePath.indexOf("content/"))
}

async function approverMap(env, root) {
  const hit = cache.get(root)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map
  let map = {}
  try {
    const file = await github(env, "GET", `/contents/${root}silica.config.json`)
    const config = JSON.parse(fromBase64(file.content))
    for (const [email, name] of Object.entries(config.approvers || {})) {
      if (typeof name === "string" && name.trim()) map[email.toLowerCase()] = name.trim()
    }
  } catch (err) {
    // No config file means no approvers, which is the default.
    if (err.status !== 404) throw err
  }
  cache.set(root, { map, at: Date.now() })
  return map
}

export async function approverName(env, pagePath, email) {
  if (!email) return null
  const map = await approverMap(env, wikiRoot(pagePath))
  return map[email.toLowerCase()] || null
}
