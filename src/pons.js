import {
  createPublicClient, createWalletClient, custom, defineChain, formatEther, http,
  isAddress, parseEther, parseEventLogs, verifyMessage,
} from 'viem'

export const CHAIN_ID = 4663
export const FACTORY_ADDRESS = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
export const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'
export const EXPLORER_URL = 'https://explorer.mainnet.chain.robinhood.com'

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Robinhood Chain Explorer', url: EXPLORER_URL } },
})

const socials = [
  { name: 'twitter', type: 'string' }, { name: 'telegram', type: 'string' },
  { name: 'discord', type: 'string' }, { name: 'website', type: 'string' },
  { name: 'farcaster', type: 'string' },
]
const tokenParams = [
  { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' },
  { name: 'logo', type: 'string' }, { name: 'description', type: 'string' },
  { name: 'socials', type: 'tuple', components: socials },
  { name: 'creatorFeeRecipient', type: 'address' },
  { name: 'creatorTaxBps', type: 'uint16' }, { name: 'buybackEnabled', type: 'bool' },
  { name: 'expectedEconomics', type: 'bytes32' }, { name: 'salt', type: 'bytes32' },
]

export const ponsAbi = [
  { type: 'function', name: 'launchEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'launchFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'canLaunch', stateMutability: 'view', inputs: [{ name: 'launcher', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'approvedPairTokens', stateMutability: 'view', inputs: [{ name: 'pairToken', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'previewLaunchEconomics', stateMutability: 'view', inputs: [{ name: 'launchConfigId', type: 'uint256' }, { name: 'pairToken', type: 'address' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'getLaunchConfig', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
    { name: 'supply', type: 'uint256' }, { name: 'curveFeeBps', type: 'uint256' },
    { name: 'phantomQuote', type: 'uint256' }, { name: 'graduationThreshold', type: 'uint256' },
    { name: 'poolFee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'enabled', type: 'bool' },
  ] }] },
  { type: 'function', name: 'launchToken', stateMutability: 'payable', inputs: [
    { name: 'params', type: 'tuple', components: tokenParams },
    { name: 'launchConfigId', type: 'uint256' }, { name: 'pairToken', type: 'address' },
  ], outputs: [{ name: 'token', type: 'address' }, { name: 'curve', type: 'address' }] },
  { type: 'event', name: 'TokenLaunched', inputs: [
    { indexed: true, name: 'token', type: 'address' }, { indexed: true, name: 'curve', type: 'address' },
    { indexed: true, name: 'deployer', type: 'address' }, { indexed: false, name: 'pairToken', type: 'address' },
    { indexed: false, name: 'launchConfigId', type: 'uint256' }, { indexed: false, name: 'graduationThreshold', type: 'uint256' },
  ] },
]

export const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL) })

function randomHex32() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

export async function readProtocol() {
  const [enabled, fee, config] = await Promise.all([
    publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'launchEnabled' }),
    publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'launchFee' }),
    publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'getLaunchConfig', args: [0n] }),
  ])
  return { enabled, fee, feeLabel: `${formatEther(fee)} ETH`, config }
}

export async function connectAndProveWallet() {
  if (!window.ethereum) throw new Error('No EIP-1193 wallet found. Install a compatible browser wallet.')
  const chainHex = `0x${CHAIN_ID.toString(16)}`
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] })
  } catch (error) {
    if (error?.code !== 4902) throw error
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: chainHex, chainName: robinhoodChain.name, nativeCurrency: robinhoodChain.nativeCurrency,
      rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER_URL],
    }] })
  }
  const walletClient = createWalletClient({ chain: robinhoodChain, transport: custom(window.ethereum) })
  const [account] = await walletClient.requestAddresses()
  const challenge = `ZUNON wallet-control proof\nChain: ${CHAIN_ID}\nWallet: ${account}\nNonce: ${crypto.randomUUID()}\nIssued: ${new Date().toISOString()}\nPurpose: prepare PONS V2 launch transactions`
  const signature = await walletClient.signMessage({ account, message: challenge })
  if (!await verifyMessage({ address: account, message: challenge, signature })) throw new Error('Wallet signature verification failed.')
  const eligible = await publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'canLaunch', args: [account] })
  return { account, eligible, walletClient, signature }
}

export async function inspectPairToken(pairToken) {
  if (!isAddress(pairToken)) throw new Error('Pair token must be a valid 0x address.')
  const approved = await publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'approvedPairTokens', args: [pairToken] })
  if (!approved) throw new Error('This pair token is not approved by the PONS V2 factory.')
  const economics = await publicClient.readContract({ address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'previewLaunchEconomics', args: [0n, pairToken] })
  return { approved, economics }
}

export async function executeLaunch({ walletClient, account, form, protocol }) {
  if (!walletClient || !account) throw new Error('Connect and sign with the controlling wallet first.')
  if (!protocol?.enabled) throw new Error('PONS V2 launches are currently disabled.')
  if (!form.name.trim() || !form.ticker.trim() || !form.mission.trim()) throw new Error('Token name, symbol and description are required.')
  const { economics } = await inspectPairToken(form.pairToken)
  const taxBps = Number(form.creatorTaxBps)
  if (!Number.isInteger(taxBps) || taxBps < 0 || taxBps > 1000) throw new Error('Creator tax must be between 0 and 1000 bps.')
  const params = {
    name: form.name.trim(), symbol: form.ticker.trim().toUpperCase(), logo: form.logo.trim(), description: form.mission.trim(),
    socials: { twitter: form.twitter.trim(), telegram: '', discord: '', website: form.website.trim(), farcaster: '' },
    creatorFeeRecipient: account, creatorTaxBps: taxBps, buybackEnabled: Boolean(form.buybackEnabled),
    expectedEconomics: economics, salt: randomHex32(),
  }
  const value = protocol.fee + parseEther(form.initialBuy || '0')
  const request = await publicClient.simulateContract({
    account, address: FACTORY_ADDRESS, abi: ponsAbi, functionName: 'launchToken',
    args: [params, 0n, form.pairToken], value,
  })
  const hash = await walletClient.writeContract(request.request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const [event] = parseEventLogs({ abi: ponsAbi, logs: receipt.logs, eventName: 'TokenLaunched', strict: false })
  return { hash, receipt, token: event?.args?.token, curve: event?.args?.curve }
}
