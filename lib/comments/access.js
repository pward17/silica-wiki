// Who is reading. Cloudflare Access sits in front of the whole site, and the
// injected email header is the fast path, but it does not reach every request,
// so the signed token Access always sets is the one this trusts.
//
// The team domain and the application's audience tag come from the
// environment (WIKI_ACCESS_TEAM_DOMAIN, WIKI_ACCESS_AUD). Both are public
// values, visible in any Access login redirect.
const JWKS_TTL_MS = 10 * 60 * 1000

let jwksCache = { keys: null, at: 0 }

const b64urlToBytes = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

const decodeSegment = (segment) => JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)))

// The signing keys rotate, so they are fetched rather than pinned, and cached
// because one isolate serves many requests.
async function accessSigningKeys(teamDomain) {
  const now = Date.now()
  if (jwksCache.keys && now - jwksCache.at < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!res.ok) {
    throw new Error(`access certs: ${res.status}`)
  }
  const body = await res.json()
  jwksCache = { keys: body.keys || [], at: now }
  return jwksCache.keys
}

// Verify signature, expiry, issuer and audience before believing the email.
// Skipping any of those turns a token from another Access application, or an
// expired one, into a valid identity here.
export async function emailFromAccessToken(token, env) {
  const teamDomain = env.WIKI_ACCESS_TEAM_DOMAIN
  const audience = env.WIKI_ACCESS_AUD
  if (!teamDomain || !audience) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null

  const header = decodeSegment(parts[0])
  const payload = decodeSegment(parts[1])
  const jwk = (await accessSigningKeys(teamDomain)).find((k) => k.kid === header.kid)
  if (!jwk) return null

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  )
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  if (!verified) return null

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(audience)) return null
  if (payload.iss && payload.iss !== `https://${teamDomain}`) return null
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

  return payload.email || null
}

export function accessToken(request) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion")
  if (assertion) return assertion
  // The browser holds the same token as a cookie, which is what survives when
  // the headers do not reach the function.
  const match = (request.headers.get("cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/)
  return match ? match[1] : null
}

// The reader's email, or a JSON error response explaining why there is none.
export async function readerEmail(request, env) {
  const header = request.headers.get("Cf-Access-Authenticated-User-Email")
  if (header) return { email: header }
  const token = accessToken(request)
  if (!token) {
    return {
      error: { status: 403, message: "Cloudflare Access sent no identity with this request." },
    }
  }
  let email
  try {
    email = await emailFromAccessToken(token, env)
  } catch (err) {
    return { error: { status: 502, message: `Could not check the Access token: ${err.message}` } }
  }
  if (!email) {
    return { error: { status: 403, message: "Cloudflare Access identity could not be verified." } }
  }
  return { email }
}
