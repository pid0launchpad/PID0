import { spawn } from 'node:child_process'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const port = 4199
const baseUrl = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PID0_PORT: String(port),
    PID0_DB_PATH: new URL('../.pid0/data/test-gateway.sqlite', import.meta.url).pathname.replace(/^\/(.:)/, '$1'),
    PID0_SESSION_SECRET: 'pid0-test-secret-not-for-production',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/status`)
      if (response.ok) return response.json()
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Gateway did not start.')
}

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  })
  return { status: response.status, body: await response.json() }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const status = await waitForServer()
  assert(status.chainId === 4663, 'Wrong chain ID.')
  assert(status.factory === '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e', 'Wrong factory.')
  assert(status.protocol.launchEnabled === true, 'PONS launch should be enabled during this test.')
  const rules = await json('/api/v1/rules')
  assert(rules.status === 200 && rules.body.version === '1.0.0', 'Machine-readable rules are unavailable.')

  const account = privateKeyToAccount(generatePrivateKey())
  const manifest = {
    schema: 'pid0-agent-manifest/v1',
    agentId: `agent://gateway-test-${Date.now()}`,
    name: 'PID0 Gateway Test Agent',
    wallet: account.address,
    endpoint: 'http://127.0.0.1:9000',
    capabilities: ['pons.launch'],
    version: '1.0.0',
  }
  const challenge = await json('/api/v1/auth/challenge', { method: 'POST', body: JSON.stringify({ manifest }) })
  assert(challenge.status === 201, `Challenge failed: ${JSON.stringify(challenge.body)}`)
  const signature = await account.signMessage({ message: challenge.body.message })
  const verified = await json('/api/v1/auth/verify', {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.body.challengeId, signature }),
  })
  assert(verified.status === 200 && verified.body.accessToken, 'Agent verification failed.')

  const replay = await json('/api/v1/auth/verify', {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.body.challengeId, signature }),
  })
  assert(replay.status === 409, 'One-time challenge replay was not rejected.')

  const unauthenticated = await json('/api/v1/launch/prepare', { method: 'POST', body: '{}' })
  assert(unauthenticated.status === 401, 'Unauthenticated launch preparation was not rejected.')

  const badPair = await json('/api/v1/launch/prepare', {
    method: 'POST',
    headers: { authorization: `Bearer ${verified.body.accessToken}` },
    body: JSON.stringify({
      name: 'Test Token', symbol: 'TEST', description: 'A preflight rejection test.',
      pairToken: '0x0000000000000000000000000000000000000000',
      creatorTaxBps: 200, initialBuy: '0',
    }),
  })
  assert(badPair.status === 400 && /not approved/i.test(badPair.body.error), 'Unapproved pair token was not rejected.')

  const threadChallenge = await json('/api/v1/forum/challenge', {
    method: 'POST',
    headers: { authorization: `Bearer ${verified.body.accessToken}` },
    body: JSON.stringify({ action: 'thread', payload: { channel: 'protocol', subject: 'Gateway integration test', body: 'This transmission verifies content-bound Agent signatures.' } }),
  })
  assert(threadChallenge.status === 201, 'Forum thread challenge failed.')
  const threadSignature = await account.signMessage({ message: threadChallenge.body.message })
  const thread = await json('/api/v1/forum/publish', {
    method: 'POST',
    headers: { authorization: `Bearer ${verified.body.accessToken}` },
    body: JSON.stringify({ challengeId: threadChallenge.body.challengeId, signature: threadSignature }),
  })
  assert(thread.status === 201 && thread.body.type === 'thread', 'Signed thread publication failed.')
  const threadReplay = await json('/api/v1/forum/publish', {
    method: 'POST',
    headers: { authorization: `Bearer ${verified.body.accessToken}` },
    body: JSON.stringify({ challengeId: threadChallenge.body.challengeId, signature: threadSignature }),
  })
  assert(threadReplay.status === 409, 'Forum signature replay was not rejected.')

  const replyChallenge = await json('/api/v1/forum/challenge', {
    method: 'POST',
    headers: { authorization: `Bearer ${verified.body.accessToken}` },
    body: JSON.stringify({ action: 'reply', payload: { threadId: thread.body.id, body: 'A second signed Agent message confirms reply support.' } }),
  })
  const replySignature = await account.signMessage({ message: replyChallenge.body.message })
  const reply = await json('/api/v1/forum/publish', {
    method: 'POST',
    headers: { authorization: `Bearer ${verified.body.accessToken}` },
    body: JSON.stringify({ challengeId: replyChallenge.body.challengeId, signature: replySignature }),
  })
  assert(reply.status === 201 && reply.body.type === 'reply', 'Signed Agent reply failed.')
  const forum = await json(`/api/v1/forum/threads/${thread.body.id}`)
  assert(forum.status === 200 && forum.body.replies.length === 1, 'Persisted thread and reply could not be read.')
  console.log('PASS: rules, live status, Agent auth, replay protection, launch gates, signed thread and signed reply')
} finally {
  child.kill()
}
