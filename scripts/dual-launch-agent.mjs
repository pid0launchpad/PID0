import { readFile, writeFile } from 'node:fs/promises'
import { formatEther, parseEther } from 'viem'
import { NodiumAgent } from '../agent-sdk/zunon-agent.mjs'

const keyPath = process.env.AGENT_KEY_FILE || '.zunon/data/dual-launch-agent.key'
const configPath = process.env.DUAL_LAUNCH_CONFIG || '.zunon/data/dual-launches.json'
const resultPath = process.env.DUAL_LAUNCH_RESULTS || '.zunon/data/dual-launch-results.json'
const baseUrl = process.env.NODIUM_URL || process.env.PID0_URL || 'https://xlbvehggulpndgrtumae.supabase.co/functions/v1/zunon-api'

const privateKey = (await readFile(keyPath, 'utf8')).trim()
const config = JSON.parse(await readFile(configPath, 'utf8'))
if (!Array.isArray(config.launches) || config.launches.length !== 2) {
  throw new Error('dual-launches.json must contain exactly two launch definitions.')
}

const normalized = config.launches.map((launch, index) => ({
  ...launch,
  name: String(launch.name || '').trim(),
  symbol: String(launch.symbol || '').trim().toUpperCase(),
  description: String(launch.description || '').trim(),
  logo: String(launch.logo || '').trim(),
  pairToken: String(launch.pairToken || config.pairToken || '').trim(),
  creatorTaxBps: Number(launch.creatorTaxBps ?? config.creatorTaxBps ?? 200),
  initialBuy: String(launch.initialBuy ?? config.initialBuy ?? '0'),
  buybackEnabled: Boolean(launch.buybackEnabled ?? config.buybackEnabled ?? false),
  socials: {
    twitter: String(launch.socials?.twitter || '').trim(),
    website: String(launch.socials?.website || '').trim(),
  },
  order: index + 1,
}))

for (const launch of normalized) {
  if (!launch.name || !launch.symbol || launch.description.length < 10) {
    throw new Error(`Launch ${launch.order} needs a name, symbol and description of at least 10 characters.`)
  }
  if (!launch.pairToken) throw new Error(`Launch ${launch.order} is missing pairToken.`)
}
if (new Set(normalized.map(item => item.name.toLowerCase())).size !== 2) throw new Error('The two token names must be different.')
if (new Set(normalized.map(item => item.symbol)).size !== 2) throw new Error('The two token symbols must be different.')

const agent = new NodiumAgent({
  baseUrl,
  privateKey,
  manifest: {
    schema: 'zunon-agent-manifest/v1',
    agentId: config.agentId || 'agent://zunon.dual-launcher',
    name: config.agentName || 'NODIUM Dual Launch Agent',
    endpoint: config.endpoint || 'https://nodium.fun/agents/dual-launcher',
    capabilities: ['pons.launch'],
    version: '1.0.0',
  },
})

const status = await agent.status()
const balance = await agent.publicClient.getBalance({ address: agent.account.address })
const totalInitialBuy = normalized.reduce((sum, item) => sum + parseEther(item.initialBuy), 0n)
const minimumValue = BigInt(status.protocol.launchFeeWei) * 2n + totalInitialBuy
const gasBuffer = parseEther(process.env.DUAL_LAUNCH_GAS_BUFFER_ETH || '0.0011')
const recommendedBalance = minimumValue + gasBuffer

console.log('Agent:', agent.manifest.agentId)
console.log('Wallet:', agent.account.address)
console.log('Balance:', formatEther(balance), 'ETH')
console.log('Protocol value for two launches:', formatEther(minimumValue), 'ETH, before gas')
console.log('Required balance with configured gas buffer:', formatEther(recommendedBalance), 'ETH')
if (balance < recommendedBalance) {
  throw new Error(`Insufficient balance. Fund ${agent.account.address} with at least ${formatEther(recommendedBalance)} ETH to cover both launches and the configured gas buffer.`)
}

await agent.authenticate()
const prepared = []
for (const launch of normalized) {
  console.log(`Preflighting ${launch.order}/2: ${launch.name} (${launch.symbol})`)
  prepared.push({ launch, intent: await agent.prepareLaunch(launch) })
}
console.log('Both PONS simulations passed. No transaction has been broadcast yet.')

if (process.env.CONFIRM_MAINNET_LAUNCH !== 'YES_LAUNCH_TWO') {
  console.log('Set CONFIRM_MAINNET_LAUNCH=YES_LAUNCH_TWO to broadcast both prepared mainnet launches.')
  process.exit(0)
}

const results = []
for (const item of prepared) {
  console.log(`Broadcasting ${item.launch.order}/2: ${item.launch.name} (${item.launch.symbol})`)
  const txHash = await agent.broadcast(item.intent)
  const receipt = await agent.publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 })
  if (receipt.status !== 'success') throw new Error(`Launch transaction reverted: ${txHash}`)
  const confirmed = await agent.confirm(item.intent.intentId, txHash)
  results.push({
    order: item.launch.order,
    name: item.launch.name,
    symbol: item.launch.symbol,
    txHash,
    token: confirmed.token,
    curve: confirmed.curve,
    pairToken: confirmed.pairToken,
    explorer: confirmed.explorer,
  })
  console.log('Confirmed:', results.at(-1))
}

await writeFile(resultPath, `${JSON.stringify({ agentId: agent.manifest.agentId, wallet: agent.account.address, createdAt: new Date().toISOString(), results }, null, 2)}\n`)
console.log(`Both launches confirmed. Results saved to ${resultPath}`)
