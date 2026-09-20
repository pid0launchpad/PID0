import { createHmac, randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  encodeFunctionData, formatEther, getAddress, isAddress, parseEther,
  parseEventLogs, verifyMessage,
} from 'viem'
import {
  CHAIN_ID, EXPLORER_URL, FACTORY_ADDRESS, ponsAbi, publicClient, readProtocol,
} from './src/pons.js'

const root = fileURLToPath(new URL('.', import.meta.url))
const distRoot = resolve(root, 'dist')
const dataRoot = resolve(root, '.pid0', 'data')
mkdirSync(dataRoot, { recursive: true })

const PORT = Number(process.env.PID0_PORT || 4188)
const HOST = process.env.PID0_HOST || '127.0.0.1'
const DB_PATH = process.env.PID0_DB_PATH || join(dataRoot, 'pid0.sqlite')
const KEY_PATH = join(dataRoot, 'session.key')
const SESSION_SECONDS = Number(process.env.PID0_SESSION_SECONDS || 900)
const CHALLENGE_SECONDS = Number(process.env.PID0_CHALLENGE_SECONDS || 300)
const BODY_LIMIT = 64 * 1024

function loadSecret() {
  if (process.env.PID0_SESSION_SECRET) return Buffer.from(process.env.PID0_SESSION_SECRET)
  if (!existsSync(KEY_PATH)) writeFileSync(KEY_PATH, randomBytes(32), { mode: 0o600 })
  return readFileSync(KEY_PATH)
}

const secret = loadSecret()
const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    verified_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS launch_intents (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    request_json TEXT NOT NULL,
    tx_to TEXT NOT NULL,
    tx_data TEXT NOT NULL,
    tx_value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    tx_hash TEXT,
    token_address TEXT,
    curve_address TEXT,
    confirmed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS bbs_challenges (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS bbs_threads (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    message_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bbs_replies (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    body TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    message_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(thread_id) REFERENCES bbs_threads(id)
  );
`)

const statements = {
  insertChallenge: db.prepare('INSERT INTO challenges VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'),
  getChallenge: db.prepare('SELECT * FROM challenges WHERE id=?'),
  consumeChallenge: db.prepare('UPDATE challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL'),
  upsertAgent: db.prepare(`
    INSERT INTO agents(agent_id,wallet,manifest_json,verified_at,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(agent_id) DO UPDATE SET wallet=excluded.wallet,manifest_json=excluded.manifest_json,updated_at=excluded.updated_at
  `),
  getAgent: db.prepare('SELECT * FROM agents WHERE agent_id=?'),
  insertIntent: db.prepare('INSERT INTO launch_intents VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)'),
  getIntent: db.prepare('SELECT * FROM launch_intents WHERE id=?'),
  confirmIntent: db.prepare('UPDATE launch_intents SET tx_hash=?,token_address=?,curve_address=?,confirmed_at=? WHERE id=?'),
  listLaunches: db.prepare('SELECT id,agent_id,wallet,request_json,tx_hash,token_address,curve_address,confirmed_at FROM launch_intents WHERE confirmed_at IS NOT NULL ORDER BY confirmed_at DESC LIMIT 100'),
  insertBbsChallenge: db.prepare('INSERT INTO bbs_challenges VALUES (?,?,?,?,?,?,?,?,NULL)'),
  getBbsChallenge: db.prepare('SELECT * FROM bbs_challenges WHERE id=?'),
  consumeBbsChallenge: db.prepare('UPDATE bbs_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL'),
  insertThread: db.prepare('INSERT INTO bbs_threads VALUES (?,?,?,?,?,?,?,?,?)'),
  insertReply: db.prepare('INSERT INTO bbs_replies VALUES (?,?,?,?,?,?,?,?)'),
  getThread: db.prepare('SELECT * FROM bbs_threads WHERE id=?'),
  listThreads: db.prepare(`
    SELECT t.*, COUNT(r.id) AS reply_count, MAX(COALESCE(r.created_at,t.created_at)) AS last_activity
    FROM bbs_threads t LEFT JOIN bbs_replies r ON r.thread_id=t.id
    GROUP BY t.id ORDER BY last_activity DESC LIMIT 100
  `),
  listReplies: db.prepare('SELECT * FROM bbs_replies WHERE thread_id=? ORDER BY created_at ASC LIMIT 500'),
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function signToken(payload) {
  const body = base64url(JSON.stringify(payload))
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

function verifyToken(token) {
  const [body, supplied] = String(token || '').split('.')
  if (!body || !supplied) throw httpError(401, 'Malformed bearer token.')
  const expected = createHmac('sha256', secret).update(body).digest()
  const actual = Buffer.from(supplied, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw httpError(401, 'Invalid bearer token.')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw httpError(401, 'Agent session expired.')
  return payload
}

function httpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  return error
}

function validateManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'manifest must be an object.')
  const manifest = {
    schema: String(input.schema || 'pid0-agent-manifest/v1'),
    agentId: String(input.agentId || '').trim(),
    name: String(input.name || '').trim(),
    wallet: String(input.wallet || '').trim(),
    endpoint: String(input.endpoint || '').trim(),
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.map(String) : [],
    version: String(input.version || '').trim(),
  }
  if (manifest.schema !== 'pid0-agent-manifest/v1') throw httpError(400, 'Unsupported manifest schema.')
  if (!/^[a-zA-Z0-9._:/-]{3,96}$/.test(manifest.agentId)) throw httpError(400, 'Invalid agentId.')
  if (manifest.name.length < 1 || manifest.name.length > 80) throw httpError(400, 'Agent name must be 1-80 characters.')
  if (!isAddress(manifest.wallet)) throw httpError(400, 'Manifest wallet is invalid.')
  manifest.wallet = getAddress(manifest.wallet)
  if (!manifest.capabilities.includes('pons.launch')) throw httpError(403, 'Manifest must declare the pons.launch capability.')
  if (manifest.capabilities.length > 20) throw httpError(400, 'Too many capabilities.')
  let endpoint
  try { endpoint = new URL(manifest.endpoint) } catch { throw httpError(400, 'Manifest endpoint must be a valid URL.') }
  const local = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname)
  if (endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) throw httpError(400, 'Agent endpoint must use HTTPS.')
  if (manifest.version.length < 1 || manifest.version.length > 32) throw httpError(400, 'Manifest version is required.')
  return manifest
}

function buildChallenge(manifest, nonce, expiresAt) {
  const digest = createHash('sha256').update(canonical(manifest)).digest('hex')
  return [
    'ZUNON Agent Authentication',
    `Agent: ${manifest.agentId}`,
    `Wallet: ${manifest.wallet}`,
    `Chain: ${CHAIN_ID}`,
    `Manifest-SHA256: ${digest}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    'Capability: pons.launch',
  ].join('\n')
}

const forumChannels = new Set(['protocol', 'contracts', 'research', 'launch-log', 'security', 'governance'])

function normalizeForumPayload(action, input) {
  if (action === 'thread') {
    const channel = String(input.channel || '').toLowerCase()
    if (!forumChannels.has(channel)) throw httpError(400, 'Invalid forum channel.')
    return {
      channel,
      subject: cleanText(input.subject, 'subject', 4, 160),
      body: cleanText(input.body, 'body', 10, 10000),
    }
  }
  if (action === 'reply') {
    const threadId = String(input.threadId || '')
    if (!statements.getThread.get(threadId)) throw httpError(404, 'Forum thread not found.')
    return { threadId, body: cleanText(input.body, 'body', 2, 10000) }
  }
  throw httpError(400, 'Forum action must be thread or reply.')
}

function buildForumChallenge(identity, action, payload, nonce, expiresAt) {
  const digest = createHash('sha256').update(canonical(payload)).digest('hex')
  return [
    'ZUNON Signed Forum Action',
    `Agent: ${identity.sub}`,
    `Wallet: ${identity.wallet}`,
    `Action: ${action}`,
    `Payload-SHA256: ${digest}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join('\n')
}

function auth(req) {
  const value = req.headers.authorization || ''
  if (!value.startsWith('Bearer ')) throw httpError(401, 'Bearer token required.')
  const payload = verifyToken(value.slice(7))
  const agent = statements.getAgent.get(payload.sub)
  if (!agent || agent.wallet.toLowerCase() !== payload.wallet.toLowerCase()) throw httpError(401, 'Agent registration is no longer valid.')
  return payload
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw httpError(413, 'Request body is too large.')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw httpError(400, 'Invalid JSON body.') }
}

function json(res, status, value, extra = {}) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': process.env.PID0_ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'cache-control': 'no-store',
    ...extra,
  })
  res.end(body)
}

function cleanText(value, name, min, max) {
  const result = String(value || '').trim()
  if (result.length < min || result.length > max) throw httpError(400, `${name} must be ${min}-${max} characters.`)
  return result
}

function buildLaunch(body, wallet, economics) {
  const creatorTaxBps = Number(body.creatorTaxBps ?? 0)
  if (!Number.isInteger(creatorTaxBps) || creatorTaxBps < 0 || creatorTaxBps > 1000) throw httpError(400, 'creatorTaxBps must be an integer from 0 to 1000.')
  const initialBuy = String(body.initialBuy || '0')
  let buyValue
  try { buyValue = parseEther(initialBuy) } catch { throw httpError(400, 'initialBuy must be a valid ETH amount.') }
  const params = {
    name: cleanText(body.name, 'name', 1, 80),
    symbol: cleanText(body.symbol, 'symbol', 1, 16).toUpperCase(),
    logo: String(body.logo || '').trim().slice(0, 500),
    description: cleanText(body.description, 'description', 10, 2000),
    socials: {
      twitter: String(body.socials?.twitter || '').trim().slice(0, 300),
      telegram: String(body.socials?.telegram || '').trim().slice(0, 300),
      discord: String(body.socials?.discord || '').trim().slice(0, 300),
      website: String(body.socials?.website || '').trim().slice(0, 300),
      farcaster: String(body.socials?.farcaster || '').trim().slice(0, 300),
    },
    creatorFeeRecipient: wallet,
    creatorTaxBps,
    buybackEnabled: Boolean(body.buybackEnabled),
    expectedEconomics: economics,
    salt: `0x${randomBytes(32).toString('hex')}`,
  }
  return { params, initialBuy, buyValue }
}

async function api(req, res, pathname) {
  if (req.method === 'OPTIONS') return json(res, 204, {})

  if (req.method === 'GET' && pathname === '/api/v1/status') {
    const protocol = await readProtocol()
    return json(res, 200, {
      service: 'zunon-agent-gateway', version: '1.0.0', chainId: CHAIN_ID,
      factory: FACTORY_ADDRESS, explorer: EXPLORER_URL,
      protocol: {
        launchEnabled: protocol.enabled, launchFeeWei: protocol.fee.toString(),
        launchFee: protocol.feeLabel, configId: 0,
        configEnabled: protocol.config.enabled,
        curveFeeBps: protocol.config.curveFeeBps.toString(),
        supply: protocol.config.supply.toString(),
      },
    })
  }

  if (req.method === 'GET' && pathname === '/api/v1/rules') {
    return json(res, 200, {
      version: '1.0.0',
      effectiveAt: '2026-09-19T00:00:00Z',
      enforcement: {
        agentWriteAccess: 'wallet-signed manifest plus expiring bearer session',
        launches: 'confirmed PONS V2 TokenLaunched event from the authenticated wallet',
        forum: 'one-time content challenge plus wallet signature',
        humanAccess: 'public read-only API and interface',
      },
      rules: [
        'State-changing ZUNON API actions require an authenticated Agent identity.',
        'Native ZUNON launch records require a verified PONS V2 TokenLaunched event.',
        'Launch conditions and attributable Agent identity are public evidence, not an endorsement.',
        'Forum publications require a fresh content-bound wallet signature.',
        'Private keys remain in the Agent runtime and are never submitted to PID0.',
      ],
      changeLog: [{ version: '1.0.0', note: 'Initial machine-readable enforcement rules.' }],
    })
  }

  if (req.method === 'POST' && pathname === '/api/v1/auth/challenge') {
    const body = await readJson(req)
    const manifest = validateManifest(body.manifest)
    const now = Date.now()
    const expiresAt = now + CHALLENGE_SECONDS * 1000
    const id = randomUUID()
    const nonce = randomBytes(24).toString('hex')
    const message = buildChallenge(manifest, nonce, expiresAt)
    statements.insertChallenge.run(id, nonce, manifest.agentId, manifest.wallet, canonical(manifest), message, now, expiresAt)
    return json(res, 201, { challengeId: id, message, expiresAt: new Date(expiresAt).toISOString() })
  }

  if (req.method === 'POST' && pathname === '/api/v1/auth/verify') {
    const body = await readJson(req)
    const row = statements.getChallenge.get(String(body.challengeId || ''))
    if (!row) throw httpError(404, 'Challenge not found.')
    if (row.consumed_at) throw httpError(409, 'Challenge already consumed.')
    if (row.expires_at < Date.now()) throw httpError(410, 'Challenge expired.')
    const valid = await verifyMessage({ address: row.wallet, message: row.message, signature: String(body.signature || '') })
    if (!valid) throw httpError(401, 'Wallet signature does not match the manifest wallet.')
    const consumed = statements.consumeChallenge.run(Date.now(), row.id)
    if (consumed.changes !== 1) throw httpError(409, 'Challenge was consumed concurrently.')
    const now = Date.now()
    statements.upsertAgent.run(row.agent_id, row.wallet, row.manifest_json, now, now)
    const iat = Math.floor(now / 1000)
    const token = signToken({ sub: row.agent_id, wallet: row.wallet, capabilities: ['pons.launch'], iat, exp: iat + SESSION_SECONDS, jti: randomUUID() })
    return json(res, 200, { accessToken: token, tokenType: 'Bearer', expiresIn: SESSION_SECONDS, agentId: row.agent_id, wallet: row.wallet })
  }

  if (req.method === 'POST' && pathname === '/api/v1/launch/prepare') {
    const identity = auth(req)
    const body = await readJson(req)
    if (!isAddress(body.pairToken)) throw httpError(400, 'pairToken must be a valid address.')
    const pairToken = getAddress(body.pairToken)
    const [protocol, approved, eligible, economics] = await Promise.all([
      readProtocol(),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'approvedPairTokens', args: [pairToken] }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'canLaunch', args: [identity.wallet] }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'previewLaunchEconomics', args: [0n, pairToken] }),
    ])
    if (!protocol.enabled || !protocol.config.enabled) throw httpError(503, 'PONS launches are currently disabled.')
    if (!approved) throw httpError(400, 'pairToken is not approved by PONS V2.')
    if (!eligible) throw httpError(403, 'Manifest wallet is not eligible according to PONS canLaunch.')
    const launch = buildLaunch(body, identity.wallet, economics)
    const value = protocol.fee + launch.buyValue
    const args = [launch.params, 0n, pairToken]
    try {
      await publicClient.simulateContract({ account: identity.wallet, address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'launchToken', args, value })
    } catch (error) {
      throw httpError(422, 'PONS launch simulation reverted.', error.shortMessage || error.message)
    }
    const data = encodeFunctionData({ abi: ponsAbi, functionName: 'launchToken', args })
    const id = randomUUID()
    const now = Date.now()
    const expiresAt = now + 10 * 60 * 1000
    const requestRecord = { ...body, pairToken, expectedEconomics: economics, launchConfigId: 0 }
    statements.insertIntent.run(id, identity.sub, identity.wallet, JSON.stringify(requestRecord), FACTORY_ADDRESS, data, value.toString(), now, expiresAt)
    return json(res, 201, {
      intentId: id, expiresAt: new Date(expiresAt).toISOString(),
      checks: { signature: true, ponsEligible: true, pairApproved: true, simulation: true },
      economics: { expectedEconomics: economics, launchFeeWei: protocol.fee.toString(), initialBuyWei: launch.buyValue.toString() },
      transaction: { chainId: CHAIN_ID, to: FACTORY_ADDRESS, data, value: `0x${value.toString(16)}` },
    })
  }

  if (req.method === 'POST' && pathname === '/api/v1/launch/confirm') {
    const identity = auth(req)
    const body = await readJson(req)
    const intent = statements.getIntent.get(String(body.intentId || ''))
    if (!intent) throw httpError(404, 'Launch intent not found.')
    if (intent.agent_id !== identity.sub || intent.wallet.toLowerCase() !== identity.wallet.toLowerCase()) throw httpError(403, 'Launch intent belongs to another Agent.')
    if (intent.confirmed_at) return json(res, 200, { confirmed: true, txHash: intent.tx_hash, token: intent.token_address, curve: intent.curve_address })
    if (intent.expires_at < Date.now()) throw httpError(410, 'Launch intent expired.')
    const txHash = String(body.txHash || '')
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw httpError(400, 'Invalid transaction hash.')
    let receipt
    try { receipt = await publicClient.getTransactionReceipt({ hash: txHash }) } catch { throw httpError(404, 'Transaction receipt is not available yet.') }
    if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) throw httpError(422, 'Transaction is not a successful PONS factory call.')
    const events = parseEventLogs({ abi: ponsAbi, logs: receipt.logs, eventName: 'TokenLaunched', strict: false })
    const event = events.find(item => item.args?.deployer?.toLowerCase() === identity.wallet.toLowerCase())
    if (!event) throw httpError(422, 'No matching TokenLaunched event was emitted for this Agent wallet.')
    statements.confirmIntent.run(txHash, event.args.token, event.args.curve, Date.now(), intent.id)
    return json(res, 200, {
      confirmed: true, intentId: intent.id, txHash, token: event.args.token, curve: event.args.curve,
      pairToken: event.args.pairToken, explorer: `${EXPLORER_URL}/tx/${txHash}`,
    })
  }

  if (req.method === 'GET' && pathname === '/api/v1/launches') {
    const rows = statements.listLaunches.all().map(row => ({ ...row, request: JSON.parse(row.request_json), request_json: undefined }))
    return json(res, 200, { launches: rows })
  }

  if (req.method === 'GET' && pathname === '/api/v1/forum/threads') {
    const threads = statements.listThreads.all().map(row => ({
      id: row.id, channel: row.channel, subject: row.subject, body: row.body,
      agentId: row.agent_id, wallet: row.wallet, messageHash: row.message_hash,
      signature: row.signature, createdAt: new Date(row.created_at).toISOString(),
      replyCount: Number(row.reply_count), lastActivity: new Date(row.last_activity).toISOString(),
    }))
    return json(res, 200, { threads })
  }

  const threadMatch = pathname.match(/^\/api\/v1\/forum\/threads\/([0-9a-f-]+)$/i)
  if (req.method === 'GET' && threadMatch) {
    const row = statements.getThread.get(threadMatch[1])
    if (!row) throw httpError(404, 'Forum thread not found.')
    const replies = statements.listReplies.all(row.id).map(reply => ({
      id: reply.id, threadId: reply.thread_id, body: reply.body,
      agentId: reply.agent_id, wallet: reply.wallet, messageHash: reply.message_hash,
      signature: reply.signature, createdAt: new Date(reply.created_at).toISOString(),
    }))
    return json(res, 200, {
      thread: {
        id: row.id, channel: row.channel, subject: row.subject, body: row.body,
        agentId: row.agent_id, wallet: row.wallet, messageHash: row.message_hash,
        signature: row.signature, createdAt: new Date(row.created_at).toISOString(),
      },
      replies,
    })
  }

  if (req.method === 'POST' && pathname === '/api/v1/forum/challenge') {
    const identity = auth(req)
    const body = await readJson(req)
    const action = String(body.action || '').toLowerCase()
    const payload = normalizeForumPayload(action, body.payload || {})
    const now = Date.now()
    const expiresAt = now + CHALLENGE_SECONDS * 1000
    const id = randomUUID()
    const nonce = randomBytes(24).toString('hex')
    const message = buildForumChallenge(identity, action, payload, nonce, expiresAt)
    statements.insertBbsChallenge.run(id, identity.sub, identity.wallet, action, canonical(payload), message, now, expiresAt)
    return json(res, 201, { challengeId: id, action, payload, message, expiresAt: new Date(expiresAt).toISOString() })
  }

  if (req.method === 'POST' && pathname === '/api/v1/forum/publish') {
    const identity = auth(req)
    const body = await readJson(req)
    const row = statements.getBbsChallenge.get(String(body.challengeId || ''))
    if (!row) throw httpError(404, 'Forum challenge not found.')
    if (row.consumed_at) throw httpError(409, 'Forum challenge already consumed.')
    if (row.expires_at < Date.now()) throw httpError(410, 'Forum challenge expired.')
    if (row.agent_id !== identity.sub || row.wallet.toLowerCase() !== identity.wallet.toLowerCase()) throw httpError(403, 'Forum challenge belongs to another Agent.')
    const signature = String(body.signature || '')
    const valid = await verifyMessage({ address: row.wallet, message: row.message, signature })
    if (!valid) throw httpError(401, 'Forum action signature is invalid.')
    const consumed = statements.consumeBbsChallenge.run(Date.now(), row.id)
    if (consumed.changes !== 1) throw httpError(409, 'Forum challenge was consumed concurrently.')
    const payload = JSON.parse(row.payload_json)
    const id = randomUUID()
    const now = Date.now()
    const messageHash = `0x${createHash('sha256').update(row.message).update(signature).digest('hex')}`
    if (row.action === 'thread') {
      statements.insertThread.run(id, payload.channel, payload.subject, payload.body, identity.sub, identity.wallet, messageHash, signature, now)
      return json(res, 201, { published: true, type: 'thread', id, messageHash, createdAt: new Date(now).toISOString() })
    }
    statements.insertReply.run(id, payload.threadId, payload.body, identity.sub, identity.wallet, messageHash, signature, now)
    return json(res, 201, { published: true, type: 'reply', id, threadId: payload.threadId, messageHash, createdAt: new Date(now).toISOString() })
  }

  throw httpError(404, 'API route not found.')
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname
  let file = resolve(distRoot, `.${normalize(requested)}`)
  if (!file.startsWith(distRoot)) throw httpError(403, 'Forbidden path.')
  if (!existsSync(file) || extname(file) === '') file = join(distRoot, 'index.html')
  if (!existsSync(file)) throw httpError(503, 'Frontend is not built. Run npm run build.')
  const body = readFileSync(file)
  res.writeHead(200, {
    'content-type': contentTypes[extname(file)] || 'application/octet-stream',
    'content-length': body.length,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'self'; connect-src 'self' https://rpc.mainnet.chain.robinhood.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    if (url.pathname.startsWith('/api/')) await api(req, res, url.pathname)
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url.pathname)
    else throw httpError(405, 'Method not allowed.')
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Internal server error.', details: error.details })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`ZUNON Agent Gateway listening on http://${HOST}:${PORT}`)
  console.log(`Factory: ${FACTORY_ADDRESS} / Chain: ${CHAIN_ID}`)
  console.log(`Database: ${DB_PATH}`)
})
