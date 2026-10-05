// Talking to GitHub as the wiki bot, in one of two ways: a GitHub App
// (WIKI_GITHUB_APP_ID, WIKI_GITHUB_PRIVATE_KEY, WIKI_GITHUB_INSTALLATION_ID),
// whose short-lived installation tokens are minted here, or a fine-grained
// personal access token (WIKI_GITHUB_TOKEN) with Issues read and write on the
// repository. The app wins when both are set.

const USER_AGENT = "silica-wiki-comments"
const TOKEN_TTL_MS = 50 * 60 * 1000 // GitHub issues them for an hour

let tokenCache = { value: null, at: 0 }

// DER length bytes for a value of this size.
function derLength(size) {
  if (size < 0x80) return [size]
  const bytes = []
  for (let rest = size; rest > 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256)
  }
  return [0x80 | bytes.length, ...bytes]
}

// GitHub hands out PKCS1 keys ("BEGIN RSA PRIVATE KEY") and WebCrypto imports
// only PKCS8, so the key is wrapped in the PKCS8 envelope: version, the
// rsaEncryption algorithm identifier, then the PKCS1 body as an octet string.
function pkcs1ToPkcs8(pkcs1) {
  const version = [0x02, 0x01, 0x00]
  const algorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]
  const key = [0x04, ...derLength(pkcs1.length), ...pkcs1]
  const body = [...version, ...algorithm, ...key]
  return Uint8Array.from([0x30, ...derLength(body.length), ...body])
}

// PEM -> CryptoKey, in either encoding. The key arrives from the environment
// with literal "\n" when it was pasted through a form, so both forms are
// accepted.
export async function importPrivateKey(pem) {
  const normalized = pem.replace(/\\n/g, "\n")
  const body = normalized
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "")
  let der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  if (/BEGIN RSA PRIVATE KEY/.test(normalized)) {
    der = pkcs1ToPkcs8(der)
  }
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
}

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

async function appJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))
  // iat is backdated for clock skew, per GitHub's own guidance.
  const payload = b64url(
    new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })),
  )
  const key = await importPrivateKey(privateKeyPem)
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${b64url(signature)}`
}

const hasApp = (env) =>
  Boolean(env.WIKI_GITHUB_APP_ID && env.WIKI_GITHUB_PRIVATE_KEY && env.WIKI_GITHUB_INSTALLATION_ID)

// Every setting comments need. Without all of them the endpoints answer 503
// and the page shows no comment controls.
export function isConfigured(env) {
  return Boolean(
    env.WIKI_GITHUB_REPO &&
    env.WIKI_ACCESS_TEAM_DOMAIN &&
    env.WIKI_ACCESS_AUD &&
    (hasApp(env) || env.WIKI_GITHUB_TOKEN),
  )
}

// owner/name of the repository the wiki lives in, where comments are filed.
export function repository(env) {
  return env.WIKI_GITHUB_REPO
}

// An installation token, minted once per isolate per hour rather than once per
// request: every page view lists the open comments, and minting is a signed
// round trip to GitHub.
export async function installationToken(env) {
  if (!hasApp(env)) return env.WIKI_GITHUB_TOKEN
  const now = Date.now()
  if (tokenCache.value && now - tokenCache.at < TOKEN_TTL_MS) {
    return tokenCache.value
  }
  const jwt = await appJwt(env.WIKI_GITHUB_APP_ID, env.WIKI_GITHUB_PRIVATE_KEY)
  const res = await fetch(
    `https://api.github.com/app/installations/${env.WIKI_GITHUB_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "user-agent": USER_AGENT,
      },
    },
  )
  if (!res.ok) {
    throw new Error(`installation token: ${res.status} ${await res.text()}`)
  }
  tokenCache = { value: (await res.json()).token, at: now }
  return tokenCache.value
}

// One call against the repository. Returns the parsed body, or throws with the
// status so the caller can turn it into a reader-facing message.
export async function github(env, method, path, body) {
  const token = await installationToken(env)
  const res = await fetch(`https://api.github.com/repos/${repository(env)}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const err = new Error(`github ${method} ${path}: ${res.status}`)
    err.status = res.status
    err.detail = await res.text()
    throw err
  }
  return res.status === 204 ? null : res.json()
}
