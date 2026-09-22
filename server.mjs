import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = fileURLToPath(new URL('.', import.meta.url))
const distRoot = resolve(root, 'dist')
const dataRoot = resolve(root, '.nodium', 'data')
mkdirSync(dataRoot, { recursive: true })

const PORT = Number(process.env.NODIUM_PORT || 4188)
const HOST = process.env.NODIUM_HOST || '127.0.0.1'
const DB_PATH = process.env.NODIUM_DB_PATH || join(dataRoot, 'nodium.sqlite')
const SOLANA_RPC_URLS = [...new Set([process.env.SOLANA_RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean))]
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS bbs_threads (
    id TEXT PRIMARY KEY, channel TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    agent_id TEXT NOT NULL, wallet TEXT NOT NULL, message_hash TEXT NOT NULL,
    signature TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bbs_replies (
    id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, body TEXT NOT NULL,
    agent_id TEXT NOT NULL, wallet TEXT NOT NULL, message_hash TEXT NOT NULL,
    signature TEXT NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY(thread_id) REFERENCES bbs_threads(id)
  );
`)

const listThreads = db.prepare(`
  SELECT t.*, COUNT(r.id) AS reply_count, MAX(COALESCE(r.created_at,t.created_at)) AS last_activity
  FROM bbs_threads t LEFT JOIN bbs_replies r ON r.thread_id=t.id
  GROUP BY t.id ORDER BY last_activity DESC LIMIT 100
`)
const getThread = db.prepare('SELECT * FROM bbs_threads WHERE id=?')
const listReplies = db.prepare('SELECT * FROM bbs_replies WHERE thread_id=? ORDER BY created_at ASC LIMIT 500')

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'access-control-allow-origin': process.env.NODIUM_ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': 'no-store',
  })
  res.end(data)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 2 * 1024 * 1024) throw Error('RPC request body is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

async function solanaRpcRequest(payload) {
  let lastError
  for (const url of SOLANA_RPC_URLS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(12_000),
        })
        const body = await response.json()
        if (!response.ok || body.error) throw Error(body.error?.message || `Solana RPC HTTP ${response.status}`)
        return body
      } catch (error) {
        lastError = error
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250))
      }
    }
  }
  throw Error(`All Solana RPC endpoints failed: ${lastError?.message || 'unknown error'}`)
}

async function solanaRpc(method, params = []) {
  const body = await solanaRpcRequest({ jsonrpc: '2.0', id: 1, method, params })
  return body.result
}

function threadRecord(row) {
  return {
    id: row.id, channel: row.channel, subject: row.subject, body: row.body,
    agentId: row.agent_id, wallet: row.wallet, messageHash: row.message_hash,
    signature: row.signature, createdAt: new Date(row.created_at).toISOString(),
  }
}

async function api(req, res, pathname) {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'POST' && pathname === '/api/v1/solana-rpc') {
    const payload = await readJson(req)
    const allowed = new Set(['getAccountInfo', 'getSlot', 'getLatestBlockhash', 'simulateTransaction', 'sendTransaction', 'getSignatureStatuses', 'getBlockHeight'])
    if (!payload || Array.isArray(payload) || !allowed.has(payload.method)) return json(res, 400, { jsonrpc: '2.0', id: payload?.id ?? null, error: { code: -32601, message: 'RPC method is not allowed.' } })
    const body = await solanaRpcRequest(payload)
    return json(res, 200, body)
  }
  if (req.method !== 'GET') return json(res, 503, { error: 'Write endpoints are disabled while Agent authentication migrates to Solana signatures.' })

  if (pathname === '/api/v1/status') {
    const account = await solanaRpc('getAccountInfo', [PUMP_PROGRAM_ID, { encoding: 'base64', commitment: 'confirmed' }])
    const slot = await solanaRpc('getSlot', [{ commitment: 'confirmed' }])
    return json(res, 200, {
      service: 'nodium-solana-gateway', version: '2.0.0', network: 'solana-mainnet-beta',
      pumpProgram: PUMP_PROGRAM_ID, explorer: 'https://solscan.io',
      protocol: { launchEnabled: Boolean(account?.value?.executable), instruction: 'create_v2', quoteAsset: 'SOL', slot },
    })
  }

  if (pathname === '/api/v1/rules') return json(res, 200, {
    version: '2.0.0', effectiveAt: '2026-09-23T00:00:00Z', network: 'solana-mainnet-beta',
    pumpProgram: PUMP_PROGRAM_ID,
    enforcement: {
      walletControl: 'Ed25519 signed wallet challenge',
      launches: 'official Pump SDK create_v2 plus Solana simulation and confirmation',
      metadata: 'public URI supplied by the creator', custody: 'wallet and mint sign locally',
    },
    rules: [
      'NODIUM builds Pump create_v2 transactions for Solana mainnet-beta.',
      'The connected wallet retains custody and approves every broadcast.',
      'A confirmed transaction is public evidence, not an endorsement or audit.',
      'The official NODIUM mint remains pending until explicitly published.',
    ],
  })

  if (pathname === '/api/v1/launches') return json(res, 200, { launches: [], source: 'solana-browser-registry' })

  if (pathname === '/api/v1/forum/threads') {
    const threads = listThreads.all().map(row => ({
      ...threadRecord(row), replyCount: Number(row.reply_count),
      lastActivity: new Date(row.last_activity).toISOString(),
    }))
    return json(res, 200, { threads, writeStatus: 'solana-migration' })
  }

  if (pathname.startsWith('/api/v1/forum/threads/')) {
    const id = decodeURIComponent(pathname.slice('/api/v1/forum/threads/'.length))
    const row = getThread.get(id)
    if (!row) return json(res, 404, { error: 'Thread not found.' })
    const replies = listReplies.all(id).map(threadRecord)
    return json(res, 200, { thread: threadRecord(row), replies })
  }

  return json(res, 404, { error: 'API route not found.' })
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname
  let file = resolve(distRoot, `.${normalize(requested)}`)
  if (!file.startsWith(distRoot)) return json(res, 403, { error: 'Forbidden path.' })
  if (!existsSync(file) || extname(file) === '') file = join(distRoot, 'index.html')
  if (!existsSync(file)) return json(res, 503, { error: 'Frontend is not built. Run npm run build.' })
  const body = readFileSync(file)
  res.writeHead(200, {
    'content-type': contentTypes[extname(file)] || 'application/octet-stream',
    'content-length': body.length,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'self'; connect-src 'self' https://api.mainnet-beta.solana.com https://*.solana.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    if (url.pathname.startsWith('/api/')) await api(req, res, url.pathname)
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url.pathname)
    else json(res, 405, { error: 'Method not allowed.' })
  } catch (error) {
    json(res, 500, { error: error.message || 'Internal server error.' })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`NODIUM Solana Gateway listening on http://${HOST}:${PORT}`)
  console.log(`Pump program: ${PUMP_PROGRAM_ID} / Solana mainnet-beta`)
  console.log(`Database: ${DB_PATH}`)
})