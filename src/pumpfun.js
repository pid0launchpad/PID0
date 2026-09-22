import { PUMP_PROGRAM_ID, PUMP_SDK, bondingCurvePda } from '@pump-fun/pump-sdk'
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import nacl from 'tweetnacl'

const localHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || (localHost
  ? new URL('/api/v1/solana-rpc', window.location.origin).toString()
  : 'https://solana-rpc.publicnode.com')
export const PROGRAM_ID = PUMP_PROGRAM_ID.toBase58()
export const EXPLORER_URL = 'https://solscan.io'
export const NETWORK = 'SOLANA MAINNET-BETA'

export const connection = new Connection(RPC_URL, 'confirmed')

function walletProvider() {
  const provider = window.phantom?.solana || window.solana
  if (!provider?.isPhantom && !provider?.signTransaction) {
    throw new Error('A Solana wallet such as Phantom is required.')
  }
  return provider
}

export async function readProtocol() {
  const program = await connection.getAccountInfo(PUMP_PROGRAM_ID, 'confirmed')
  const slot = await connection.getSlot('confirmed')
  if (!program?.executable) throw new Error('The Pump program is unavailable on Solana mainnet.')
  return {
    enabled: true,
    programId: PROGRAM_ID,
    slot,
    feeLabel: 'SOL NETWORK + PUMP FEES',
    config: { enabled: true, quote: 'SOL', mode: 'CREATE_V2' },
  }
}

export async function connectAndProveWallet() {
  const provider = walletProvider()
  const connected = await provider.connect()
  const publicKey = connected.publicKey || provider.publicKey
  if (!publicKey) throw new Error('The wallet did not return a public key.')

  const message = new TextEncoder().encode(
    `NODIUM wallet-control proof\nNetwork: Solana mainnet-beta\nWallet: ${publicKey.toBase58()}\nNonce: ${crypto.randomUUID()}\nIssued: ${new Date().toISOString()}\nPurpose: create tokens through pump.fun`,
  )
  if (!provider.signMessage) throw new Error('This wallet does not support message signing.')
  const signed = await provider.signMessage(message, 'utf8')
  const signature = signed.signature || signed
  const verified = nacl.sign.detached.verify(message, signature, publicKey.toBytes())
  if (!verified) throw new Error('Wallet signature verification failed.')

  return { provider, publicKey, account: publicKey.toBase58(), eligible: true, signature: Array.from(signature) }
}

function validateMetadata(form) {
  const name = String(form.name || '').trim()
  const symbol = String(form.ticker || '').trim().toUpperCase()
  const uri = String(form.metadataUri || '').trim()
  if (!name || name.length > 32) throw new Error('Token name must be 1-32 characters.')
  if (!symbol || symbol.length > 13) throw new Error('Symbol must be 1-13 characters.')
  if (!uri || uri.length > 200) throw new Error('Metadata URI must be 1-200 characters.')
  if (!/^(https?:\/\/|ipfs:\/\/|ar:\/\/)/i.test(uri)) throw new Error('Metadata URI must use https://, ipfs://, or ar://.')
  return { name, symbol, uri }
}

export async function executeLaunch({ provider, publicKey, form }) {
  if (!provider || !publicKey) throw new Error('Connect a Solana wallet first.')
  const { name, symbol, uri } = validateMetadata(form)
  const mint = Keypair.generate()
  const instruction = await PUMP_SDK.createV2Instruction({
    mint: mint.publicKey,
    name,
    symbol,
    uri,
    creator: publicKey,
    user: publicKey,
    mayhemMode: Boolean(form.mayhemMode),
    cashback: false,
    holderReward: Boolean(form.holderReward),
  })
  const latest = await connection.getLatestBlockhash('confirmed')
  const transaction = new Transaction({ feePayer: publicKey, recentBlockhash: latest.blockhash }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
    instruction,
  )
  transaction.partialSign(mint)
  const signed = await provider.signTransaction(transaction)
  const simulation = await connection.simulateTransaction(signed)
  if (simulation.value.err) throw new Error(`Pump create simulation failed: ${JSON.stringify(simulation.value.err)}`)
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 })
  let confirmation = null
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const statuses = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
    confirmation = statuses.value[0]
    if (confirmation?.err) throw new Error(`Pump create transaction failed: ${JSON.stringify(confirmation.err)}`)
    if (confirmation?.confirmationStatus === 'confirmed' || confirmation?.confirmationStatus === 'finalized') break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!confirmation || !['confirmed', 'finalized'].includes(confirmation.confirmationStatus)) throw new Error('Timed out waiting for Solana confirmation.')
  const result = {
    id: signature,
    hash: signature,
    token: mint.publicKey.toBase58(),
    curve: bondingCurvePda(mint.publicKey).toBase58(),
    name,
    symbol,
    metadataUri: uri,
    creator: publicKey.toBase58(),
    createdAt: new Date().toISOString(),
  }
  const stored = JSON.parse(localStorage.getItem('nodium-solana-launches') || '[]')
  localStorage.setItem('nodium-solana-launches', JSON.stringify([result, ...stored.filter(item => item.hash !== signature)].slice(0, 100)))
  window.dispatchEvent(new CustomEvent('nodium:launch', { detail: result }))
  return result
}

export function isSolanaAddress(value) {
  try { new PublicKey(value); return true } catch { return false }
}