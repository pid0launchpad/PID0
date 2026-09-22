import { useEffect, useMemo, useState } from 'react'
import { connection, EXPLORER_URL, PROGRAM_ID } from './pumpfun'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'N/A'
const official = {
  id: 'nodium', token: 'NODIUM', ticker: 'NODIUM', type: 'OFFICIAL PROJECT TOKEN',
  status: 'CA PENDING', agent: 'NODIUM NETWORK', network: 'SOLANA MAINNET-BETA',
  contract: '', curve: '', txHash: '', pairLabel: 'SOL',
  description: 'The official NODIUM token mint has not been published. No address should be treated as official until it appears here.',
  proof: 'AWAITING OFFICIAL TOKEN MINT',
}


const testTokens = [
  {
    id: 'test-1', token: 'TEST 1', ticker: 'TEST', type: 'PUMP.FUN TEST TOKEN',
    status: 'PUMP VERIFIED', agent: 'NODIUM TEST', network: 'SOLANA MAINNET-BETA',
    contract: 'AqXqcSX2yLNHsUEp932XZR443Uk8KJWkKYYQeNhRpump',
    curve: '8DrLzN6U3WGLCgRWAquNsbuRaWhb8ovZhcM5eL57P2o3', txHash: '', pairLabel: 'SOL',
    description: 'NODIUM test token. Its Token-2022 mint and Pump bonding curve have been verified on Solana.',
    proof: 'PUMP BONDING CURVE VERIFIED',
  },
  {
    id: 'test-2', token: 'TEST 2', ticker: 'TEST', type: 'PUMP.FUN TEST TOKEN',
    status: 'PUMP VERIFIED', agent: 'NODIUM TEST', network: 'SOLANA MAINNET-BETA',
    contract: 'F7HRNAN1KPLuYAT1Y2ChdyAsjFw3Gz7sGexhxt3Ppump',
    curve: '2a28PSokNMjzx7rpiDbXguEerZXVzKWPuhBKyxUuPckC', txHash: '', pairLabel: 'SOL',
    description: 'NODIUM test token. Its Token-2022 mint and Pump bonding curve have been verified on Solana.',
    proof: 'PUMP BONDING CURVE VERIFIED',
  },
]

function loadLaunches() {
  try { return JSON.parse(localStorage.getItem('nodium-solana-launches') || '[]') } catch { return [] }
}

function Pane({ title, meta, className, children }) {
  return <section className={'frame ' + className}><div className="frame-title"><span>|- {title} -|</span><b>{meta}</b></div>{children}</section>
}

export default function VerifiedMarket() {
  const [launches, setLaunches] = useState([])
  const [sync, setSync] = useState('SYNCING')
  const [selectedId, setSelectedId] = useState('nodium')

  async function refresh() {
    const stored = loadLaunches()
    if (!stored.length) { setLaunches([]); setSync('SOLANA READY'); return }
    setSync('VERIFYING')
    try {
      const result = await connection.getSignatureStatuses(stored.map(item => item.hash), { searchTransactionHistory: true })
      setLaunches(stored.map((item, index) => ({
        ...item,
        status: result.value[index]?.err ? 'FAILED' : (result.value[index]?.confirmationStatus || 'NOT FOUND').toUpperCase(),
      })))
      setSync('SOLANA VERIFIED')
    } catch {
      setLaunches(stored.map(item => ({ ...item, status: 'LOCAL RECORD' })))
      setSync('RPC OFFLINE')
    }
  }

  useEffect(() => {
    refresh()
    const update = () => refresh()
    addEventListener('nodium:launch', update)
    return () => removeEventListener('nodium:launch', update)
  }, [])

  const records = useMemo(() => [official, ...launches.map(item => ({
    id: item.id || item.hash,
    token: item.name || 'UNNAMED',
    ticker: item.symbol || 'N/A',
    type: 'PUMP.FUN CREATE_V2',
    status: item.status || 'CONFIRMED',
    agent: short(item.creator),
    network: 'SOLANA MAINNET-BETA',
    contract: item.token,
    curve: item.curve,
    pairLabel: 'SOL',
    txHash: item.hash,
    description: `Created through the Pump program using metadata ${item.metadataUri || 'not recorded'}.`,
    proof: 'SOLANA PUMP TRANSACTION',
  })), ...testTokens], [launches])
  const selected = records.find(item => item.id === selectedId) || records[0]

  return <main className="main-panes verified-market">
    <Pane title={'INSPECT :: $' + selected.ticker} meta={selected.status} className="inspect-pane project-inspect verified-inspect">
      <div className="project-title"><div className={'token-glyph ' + (selected.id === 'nodium' ? 'official-nodium-logo' : '')}>{selected.id === 'nodium' ? '' : '$'}</div><div><h2>{selected.token}</h2><p>{selected.agent}</p><span className="signal">{selected.type}</span></div></div>
      <p className="description">{selected.description}</p>
      <dl>
        <dt>CLASSIFICATION</dt><dd>{selected.type}</dd><dt>NETWORK</dt><dd>{selected.network}</dd>
        <dt>TOKEN MINT</dt><dd>{selected.contract || 'NOT PUBLISHED'}</dd>
        <dt>BONDING CURVE</dt><dd>{selected.curve ? short(selected.curve) : 'NOT AVAILABLE'}</dd>
        <dt>QUOTE ASSET</dt><dd>{selected.pairLabel}</dd>
        <dt>PRICE</dt><dd>NOT INDEXED</dd><dt>HOLDERS</dt><dd>NOT INDEXED</dd>
        <dt>ONCHAIN PROOF</dt><dd>{selected.proof}</dd>
      </dl>
      {selected.contract && <a className="verified-action" href={`${EXPLORER_URL}/token/${selected.contract}`} target="_blank" rel="noreferrer">[OPEN TOKEN ON SOLSCAN]</a>}
      {selected.contract && <a className="verified-action" href={`https://pump.fun/coin/${selected.contract}`} target="_blank" rel="noreferrer">[OPEN ON PUMP.FUN]</a>}
      {selected.txHash ? <a className="verified-action" href={`${EXPLORER_URL}/tx/${selected.txHash}`} target="_blank" rel="noreferrer">[OPEN SOLANA TRANSACTION]</a> : <button className="execute" disabled>{selected.id === 'nodium' ? '[AWAITING OFFICIAL MINT]' : '[TEST TOKEN VERIFIED]'}</button>}
    </Pane>

    <Pane title="TOKEN REGISTRY :: SOLANA" meta={`${launches.length} PUMP LAUNCH${launches.length === 1 ? '' : 'ES'} / 2 TEST VERIFIED / OFFICIAL CA PENDING`} className="list-pane token-list verified-registry">
      <div className="market-controls"><span>DATA SOURCE:</span><button className="on">[SOLANA RPC]</button><button onClick={refresh}>[REFRESH]</button><b>{sync}</b></div>
      <div className="verified-table-head"><span>TOKEN</span><span>RECORD</span><span>STATUS</span><span>MINT</span></div>
      <div className="verified-agent-list">{records.map(record => <button key={record.id} className={(selected.id === record.id ? 'selected ' : '') + (record.id === 'nodium' ? 'official-token-row' : '')} onClick={() => setSelectedId(record.id)}><b>{'$' + record.ticker}</b><span>{record.token}{record.id === 'nodium' && <em>OFFICIAL</em>}</span><span>{record.status}</span><span>{record.contract ? short(record.contract) : 'PENDING'}</span></button>)}</div>
      <div className="market-summary verified-summary"><span>LOCAL PUMP RECORDS <b>{String(launches.length).padStart(2, '0')}</b></span><span>$NODIUM OFFICIAL MINT <b>PENDING</b></span><span>TEST TOKENS <b>02 VERIFIED</b></span><span>SYNC STATE <b>{sync}</b></span></div>
      <div className="pane-foot">TEST 1 + TEST 2 PUMP VERIFIED / OFFICIAL $NODIUM MINT PENDING</div>
    </Pane>

    <Pane title="PROJECT :: NODIUM" meta={sync} className="project-pane nodium-profile nodium-plain verified-project">
      <div className="nodium-scroll">
        <div className="project-title"><div className="token-glyph">ND</div><div><h2>NODIUM</h2><p>AGENT LAUNCH GATEWAY FOR SOLANA AND PUMP.FUN</p><span className="signal">LIVE MAINNET BUILD / SOLANA</span></div></div>
        <div className="nodium-token-card">
          <div className="nodium-token-card-head"><b>$NODIUM TOKEN</b><span>CA PENDING</span></div>
          <div className="nodium-token-ca"><span>OFFICIAL TOKEN MINT</span><strong>TO BE ANNOUNCED</strong></div>
          <div className="nodium-token-links"><a href="https://x.com/nodiumdotfun" target="_blank" rel="noreferrer">[OFFICIAL X]</a></div>
          <p>No official NODIUM mint has been published. Wait for the real address to appear here and through the official NODIUM channel.</p>
        </div>
        <div className="nodium-lead">NODIUM connects a Solana wallet, verifies control with an Ed25519 signature, builds an official Pump create_v2 instruction, simulates the signed transaction and broadcasts it to Solana only after wallet approval.</div>
        <div className="nodium-summary"><b>LIVE SYSTEM STATE</b><span>RPC: {sync}</span><span>PROGRAM: {short(PROGRAM_ID)}</span><span>PUMP CREATE: ENABLED</span><span>QUOTE: SOL</span><span>LOCAL LAUNCHES: {launches.length}</span><span>TEST TOKENS: 2 VERIFIED</span></div>
        <Section title="WHAT NODIUM IS TODAY"><p>NODIUM is a Solana token launch interface built around pump.fun's official SDK. The browser controls wallet connection, metadata validation, mint generation, transaction construction, simulation and confirmation.</p><p>The wallet retains custody and signs the final transaction. NODIUM never receives the seed phrase or private key.</p></Section>
        <Section title="THE PUMP LAUNCH PATH"><p>A fresh Token-2022 mint keypair is generated locally. Pump create_v2 receives the mint, coin name, symbol, metadata URI, creator and user public keys.</p><p>The mint and wallet sign the transaction. NODIUM simulates it first, broadcasts it through Solana RPC and records the confirmed signature and mint locally.</p></Section>
        <Section title="REGISTRY COVERAGE"><p>The Registry includes two verified NODIUM test tokens and pump.fun launches confirmed from this browser. Each record links to its Solscan token page, Solana transaction and pump.fun coin page.</p><p>Price and holder data stay unindexed until a reliable Solana data source is connected.</p></Section>
        <Section title="OFFICIAL NODIUM STATUS"><p>The official $NODIUM mint remains unpublished. No external address should be treated as official until it is displayed in this card and announced through the official NODIUM channel.</p></Section>
        <div className="project-section final-note"><b>OFFICIAL IDENTIFIERS</b><p>Network: Solana mainnet-beta. Pump program: {PROGRAM_ID}. $NODIUM mint: PENDING PUBLICATION.</p><p><a href="https://x.com/nodiumdotfun" target="_blank" rel="noreferrer">[OFFICIAL X]</a> <a href="https://pump.fun" target="_blank" rel="noreferrer">[PUMP.FUN]</a></p></div>
      </div>
    </Pane>
  </main>
}

function Section({ title, children }) { return <div className="project-section"><b>{title}</b>{children}</div> }