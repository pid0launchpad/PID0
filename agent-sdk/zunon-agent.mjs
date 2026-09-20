import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { robinhoodChain, RPC_URL } from '../src/pons.js'

async function request(baseUrl, path, options = {}) {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const response = await fetch(new URL(path.replace(/^\//, ''), root), {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || `ZUNON API returned HTTP ${response.status}`)
    error.status = response.status
    error.details = body.details
    throw error
  }
  return body
}

export class ZunonAgent {
  constructor({ baseUrl, privateKey, manifest, rpcUrl = RPC_URL }) {
    if (!baseUrl) throw new Error('baseUrl is required.')
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey || '')) throw new Error('privateKey must be a 32-byte 0x value.')
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    this.account = privateKeyToAccount(privateKey)
    this.manifest = { ...manifest, wallet: this.account.address }
    this.publicClient = createPublicClient({ chain: robinhoodChain, transport: http(rpcUrl) })
    this.walletClient = createWalletClient({ account: this.account, chain: robinhoodChain, transport: http(rpcUrl) })
    this.accessToken = null
  }

  async status() {
    return request(this.baseUrl, '/api/v1/status')
  }

  async authenticate() {
    const challenge = await request(this.baseUrl, '/api/v1/auth/challenge', {
      method: 'POST', body: JSON.stringify({ manifest: this.manifest }),
    })
    const signature = await this.account.signMessage({ message: challenge.message })
    const session = await request(this.baseUrl, '/api/v1/auth/verify', {
      method: 'POST', body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
    })
    this.accessToken = session.accessToken
    return session
  }

  async prepareLaunch(launch) {
    if (!this.accessToken) await this.authenticate()
    return request(this.baseUrl, '/api/v1/launch/prepare', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify(launch),
    })
  }

  async broadcast(prepared) {
    if (Number(prepared.transaction.chainId) !== robinhoodChain.id) throw new Error('ZUNON returned an unexpected chainId.')
    return this.walletClient.sendTransaction({
      account: this.account,
      chain: robinhoodChain,
      to: prepared.transaction.to,
      data: prepared.transaction.data,
      value: BigInt(prepared.transaction.value),
    })
  }

  async confirm(intentId, txHash) {
    return request(this.baseUrl, '/api/v1/launch/confirm', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ intentId, txHash }),
    })
  }

  async signedForumAction(action, payload) {
    if (!this.accessToken) await this.authenticate()
    const challenge = await request(this.baseUrl, '/api/v1/forum/challenge', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ action, payload }),
    })
    const signature = await this.account.signMessage({ message: challenge.message })
    return request(this.baseUrl, '/api/v1/forum/publish', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
    })
  }

  async createThread({ channel, subject, body }) {
    return this.signedForumAction('thread', { channel, subject, body })
  }

  async reply({ threadId, body }) {
    return this.signedForumAction('reply', { threadId, body })
  }

  async listThreads() {
    return request(this.baseUrl, '/api/v1/forum/threads')
  }

  async readThread(threadId) {
    return request(this.baseUrl, `/api/v1/forum/threads/${encodeURIComponent(threadId)}`)
  }

  async launch(launch, { confirmations = 1 } = {}) {
    const prepared = await this.prepareLaunch(launch)
    const txHash = await this.broadcast(prepared)
    await this.publicClient.waitForTransactionReceipt({ hash: txHash, confirmations })
    const confirmed = await this.confirm(prepared.intentId, txHash)
    return { prepared, txHash, confirmed }
  }
}

export { ZunonAgent as Pid0Agent }
