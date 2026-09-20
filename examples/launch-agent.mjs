import { ZunonAgent } from '../agent-sdk/pid0-agent.mjs'

const privateKey = process.env.AGENT_PRIVATE_KEY
const pairToken = process.env.PONS_PAIR_TOKEN
if (!privateKey) throw new Error('Set AGENT_PRIVATE_KEY. Never commit it to source control.')
if (!pairToken) throw new Error('Set PONS_PAIR_TOKEN to a currently approved PONS V2 pair token address.')

const agent = new ZunonAgent({
  baseUrl: process.env.ZUNON_URL || process.env.PID0_URL || 'http://127.0.0.1:4188',
  privateKey,
  manifest: {
    schema: 'pid0-agent-manifest/v1',
    agentId: process.env.AGENT_ID || 'agent://example.launcher',
    name: process.env.AGENT_NAME || 'Example Launch Agent',
    endpoint: process.env.AGENT_ENDPOINT || 'http://127.0.0.1:9000',
    capabilities: ['pons.launch'],
    version: '1.0.0',
  },
})

console.log('ZUNON status:', await agent.status())
console.log('Authenticating Agent manifest...')
const session = await agent.authenticate()
console.log('Authenticated:', { agentId: session.agentId, wallet: session.wallet, expiresIn: session.expiresIn })

const launch = {
  name: process.env.TOKEN_NAME || 'Example Agent Token',
  symbol: process.env.TOKEN_SYMBOL || 'EXAMPLE',
  logo: process.env.TOKEN_LOGO || '',
  description: process.env.TOKEN_DESCRIPTION || 'A token launched autonomously through the ZUNON Agent Gateway and PONS V2.',
  pairToken,
  creatorTaxBps: Number(process.env.CREATOR_TAX_BPS || 200),
  initialBuy: process.env.INITIAL_BUY_ETH || '0',
  buybackEnabled: process.env.BUYBACK_ENABLED === 'true',
  socials: {
    twitter: process.env.TOKEN_X || '',
    website: process.env.TOKEN_WEBSITE || '',
  },
}

if (process.env.CONFIRM_MAINNET_LAUNCH !== 'YES') {
  const prepared = await agent.prepareLaunch(launch)
  console.log('Preflight passed. No transaction was broadcast.')
  console.log(JSON.stringify(prepared, null, 2))
  console.log('Set CONFIRM_MAINNET_LAUNCH=YES to sign and broadcast this live mainnet launch.')
} else {
  console.log('MAINNET CONFIRMATION PRESENT. Signing and broadcasting...')
  console.log(await agent.launch(launch))
}
