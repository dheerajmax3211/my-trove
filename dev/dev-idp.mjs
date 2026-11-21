#!/usr/bin/env node
// Local development identity provider. NOT FOR PRODUCTION.
//
// Mints RS256 ID tokens that look like Firebase ID tokens (issuer https://securetoken.google.com/<project>,
// audience <project>) and serves the matching JWKS, so every Spring service can verify them with
//   FIREBASE_PROJECT_ID=demo-platform
//   APP_FIREBASE_JWK_SET_URI=http://localhost:9100/jwks
// and the web apps can sign in with VITE_DEV_IDP_URL=http://localhost:9100, with no Firebase project.
//
//   GET  /jwks             public key set
//   POST /token            {"email": "...", "name": "..."} -> {"token", "user": {...}}
//
// Zero dependencies. Binds to 127.0.0.1 only and answers CORS only for localhost origins.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.DEV_IDP_PORT ?? 9100)
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'demo-platform'
const TTL_SECONDS = 3600
const STATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '.state')
const KEY_FILE = join(STATE_DIR, 'idp-key.json')

// The key persists across restarts, so tokens (and the services' cached JWKS) stay valid.
function loadKey() {
  if (existsSync(KEY_FILE)) return JSON.parse(readFileSync(KEY_FILE, 'utf8'))
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = privateKey.export({ format: 'jwk' })
  const kid = createHash('sha256').update(jwk.n).digest('hex').slice(0, 16)
  const stored = { kid, jwk }
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(KEY_FILE, JSON.stringify(stored), { mode: 0o600 })
  return stored
}

const { kid, jwk } = loadKey()
const privateKey = createPrivateKey({ key: jwk, format: 'jwk' })
const publicJwk = { ...createPublicKey(privateKey).export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }

const b64url = (input) => Buffer.from(input).toString('base64url')

function mint(email, name) {
  const uid = `dev-${createHash('sha256').update(email).digest('hex').slice(0, 20)}`
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT', kid }
  const claims = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: uid,
    user_id: uid,
    iat: now,
    auth_time: now,
    exp: now + TTL_SECONDS,
    email,
    email_verified: true,
    name,
    firebase: { identities: { email: [email] }, sign_in_provider: 'custom' },
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url')
  return {
    token: `${signingInput}.${signature}`,
    expiresAt: (now + TTL_SECONDS) * 1000,
    user: { uid, email, displayName: name, photoURL: null, emailVerified: true },
  }
}

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const server = createServer((req, res) => {
  const origin = req.headers.origin
  if (origin && LOCAL_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (req.method === 'OPTIONS') return void res.writeHead(204).end()
  if (req.method === 'GET' && (path === '/jwks' || path === '/.well-known/jwks.json')) {
    return json(200, { keys: [publicJwk] })
  }
  if (req.method === 'GET' && path === '/health') return json(200, { status: 'UP', project: PROJECT })
  if (req.method === 'POST' && path === '/token') {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 4096) req.destroy()
    })
    req.on('end', () => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(400, { error: 'invalid JSON' })
      }
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!EMAIL.test(email)) return json(400, { error: 'a valid "email" is required' })
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : email.split('@')[0]
      json(200, mint(email, name))
    })
    return
  }
  json(404, { error: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev-idp listening on http://127.0.0.1:${PORT} (project ${PROJECT}, kid ${kid}). Development only.`)
})
