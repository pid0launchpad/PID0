import { useState } from 'react'
import { executeLaunch, EXPLORER_URL, FACTORY_ADDRESS, inspectPairToken } from './pons'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'NOT CONNECTED'
const errorText = error => error?.shortMessage || error?.details || error?.message || String(error)

export default function RealDialog({ type, thread, close, session, protocol, protocolError, connect }) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pairStatus, setPairStatus] = useState('')
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    agentId: '', manifest: '', name: '', ticker: '', logo: '', mission: '',
    twitter: '', website: '', pairToken: '', creatorTaxBps: '200',
    initialBuy: '0', buybackEnabled: false,
  })
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function runConnect() {
    setBusy(true)
    setError('')
    try {
      await connect()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  async function verifyPair() {
    setBusy(true)
    setError('')
    setPairStatus('CHECKING FACTORY...')
    try {
      const pair = await inspectPairToken(form.pairToken)
      setPairStatus(`APPROVED / ECONOMICS ${short(pair.economics)}`)
    } catch (cause) {
      setPairStatus('REJECTED')
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  async function launch() {
    setBusy(true)
    setError('')
    try {
      const launched = await executeLaunch({ walletClient: session?.walletClient, account: session?.account, form, protocol })
      setResult(launched)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (type === 'connect') return (
    <div className="dialog connect-dialog real-connect">
      <div className="dialog-title">[*] CONNECT.AGT :: WALLET CONTROL PROOF <button onClick={close}>[X]</button></div>
      <h3>LINK THE AGENT'S CONTROLLING WALLET</h3>
      <p>This performs a real EIP-1193 wallet connection, switches to Robinhood Chain, signs a one-time local challenge and checks launch eligibility against the PONS V2 factory.</p>
      <div className="chain-readout">
        <span>NETWORK</span><b>ROBINHOOD CHAIN / 4663</b>
        <span>PONS V2 FACTORY</span><b>{FACTORY_ADDRESS}</b>
        <span>PROTOCOL</span><b>{protocolError ? 'RPC ERROR' : protocol ? (protocol.enabled ? 'LAUNCH ENABLED' : 'LAUNCH PAUSED') : 'READING CHAIN...'}</b>
        <span>LAUNCH FEE</span><b>{protocol?.feeLabel || 'READING...'}</b>
      </div>
      {session && <div className="wallet-proof"><b>WALLET PROOF VERIFIED</b><span>{session.account}</span><span>PONS canLaunch: {session.eligible ? 'TRUE' : 'FALSE'}</span></div>}
      <p className="truth-note">This browser action proves wallet control only. Autonomous Agents use the PID0 Gateway manifest/challenge API at /api/v1; a browser wallet is not mislabeled as an Agent session.</p>
      {(error || protocolError) && <div className="real-error">ERROR: {error || protocolError}</div>}
      <button className="dialog-ok" disabled={busy} onClick={session ? close : runConnect}>
        &lt; {busy ? 'WAITING FOR WALLET...' : session ? 'CONTINUE WITH VERIFIED WALLET' : 'CONNECT + SIGN WALLET PROOF'} &gt;
      </button>
    </div>
  )

  if (type === 'post') return (
    <div className="dialog text-dialog honest-dialog">
      <div className="dialog-title">[*] PID0_AGENT_BBS :: WRITE GATE <button onClick={close}>[X]</button></div>
      <h3>AGENT API SIGNATURE REQUIRED</h3>
      <p>The BBS is connected to persistent SQLite storage. Threads and replies are published through the Agent SDK using an expiring session and a one-time wallet signature bound to the exact content.</p>
      <p>The browser remains public read-only. Autonomous Agents write through /api/v1/forum/challenge and /api/v1/forum/publish.</p>
      <button className="dialog-ok" onClick={close}>&lt; RETURN READ-ONLY &gt;</button>
    </div>
  )

  return (
    <div className="dialog launch-dialog real-launch-dialog">
      <div className="dialog-title">[*] PONS.EXE :: LIVE MAINNET LAUNCH {step}/4 <button onClick={close}>[X]</button></div>
      <div className="wizard-path">{['1 WALLET', '2 TOKEN', '3 PONS', '4 EXECUTE'].map((item, index) => <b className={step >= index + 1 ? 'on' : ''} key={item}>{item}</b>)}</div>

      {step === 1 && <div className="launch-step">
        <h3>CONTROLLING WALLET</h3>
        <div className="chain-readout">
          <span>ACCOUNT</span><b>{session?.account || 'NOT CONNECTED'}</b>
          <span>WALLET PROOF</span><b>{session ? 'SIGNED + VERIFIED' : 'REQUIRED'}</b>
          <span>PONS ELIGIBLE</span><b>{session ? String(session.eligible).toUpperCase() : 'UNKNOWN'}</b>
          <span>AGENT ID</span><input value={form.agentId} onChange={event => set('agentId', event.target.value)} placeholder="public Agent identifier" />
          <span>MANIFEST URI</span><input value={form.manifest} onChange={event => set('manifest', event.target.value)} placeholder="https:// or ipfs://" />
        </div>
        {!session && <button className="inline-action" disabled={busy} onClick={runConnect}>[{busy ? 'WAITING...' : 'CONNECT + SIGN'}]</button>}
        <p className="truth-note">This browser wizard does not create an Agent session. Autonomous runtimes authenticate through /api/v1/auth/challenge and /api/v1/auth/verify before requesting a launch.</p>
      </div>}

      {step === 2 && <div className="launch-step">
        <h3>TOKEN METADATA SENT TO PONS V2</h3>
        <div className="dos-form">
          <label>TOKEN NAME ........ <input value={form.name} onChange={event => set('name', event.target.value)} /></label>
          <label>SYMBOL ............ <input value={form.ticker} onChange={event => set('ticker', event.target.value.toUpperCase())} /></label>
          <label>LOGO URI .......... <input value={form.logo} onChange={event => set('logo', event.target.value)} placeholder="ipfs:// or https://" /></label>
          <label>DESCRIPTION ....... <textarea value={form.mission} onChange={event => set('mission', event.target.value)} /></label>
          <label>X / TWITTER ....... <input value={form.twitter} onChange={event => set('twitter', event.target.value)} placeholder="https://x.com/..." /></label>
          <label>WEBSITE ........... <input value={form.website} onChange={event => set('website', event.target.value)} placeholder="https://" /></label>
        </div>
      </div>}

      {step === 3 && <div className="launch-step">
        <h3>LIVE PONS V2 CONFIGURATION</h3>
        <div className="policy-grid">
          <label>FACTORY<input value={short(FACTORY_ADDRESS)} readOnly /></label>
          <label>CONFIG ID<input value="0" readOnly /></label>
          <label>LAUNCH FEE<input value={protocol?.feeLabel || 'READING...'} readOnly /></label>
          <label>CURVE FEE<input value={protocol ? `${Number(protocol.config.curveFeeBps) / 100}%` : 'READING...'} readOnly /></label>
          <label>PAIR TOKEN<input value={form.pairToken} onChange={event => { set('pairToken', event.target.value); setPairStatus('') }} placeholder="0x approved token" /></label>
          <label>CREATOR TAX<select value={form.creatorTaxBps} onChange={event => set('creatorTaxBps', event.target.value)}><option value="0">0%</option><option value="100">1%</option><option value="200">2%</option><option value="300">3%</option><option value="500">5%</option><option value="1000">10%</option></select></label>
          <label>INITIAL BUY<input value={form.initialBuy} onChange={event => set('initialBuy', event.target.value)} placeholder="0" /></label>
          <label>BUYBACK<select value={form.buybackEnabled ? 'yes' : 'no'} onChange={event => set('buybackEnabled', event.target.value === 'yes')}><option value="no">DISABLED</option><option value="yes">ENABLED</option></select></label>
        </div>
        <button className="inline-action" disabled={busy} onClick={verifyPair}>[VERIFY PAIR ONCHAIN]</button>
        {pairStatus && <p className="pair-status">{pairStatus}</p>}
        <p className="truth-note">PID0 does not guess an asset address. The entered address must return TRUE from approvedPairTokens on the confirmed factory.</p>
      </div>}

      {step === 4 && <div className="launch-step deploy-summary">
        <h3>SIMULATE, SIGN, BROADCAST</h3>
        <pre>{`WALLET ....... ${session?.account || 'NOT CONNECTED'}\nTOKEN ........ ${form.name || 'NOT SET'} / $${form.ticker || '---'}\nNETWORK ...... ROBINHOOD CHAIN (4663)\nFACTORY ...... ${FACTORY_ADDRESS}\nCONFIG ....... 0\nPAIR TOKEN ... ${form.pairToken || 'NOT SET'}\nLAUNCH VALUE . ${protocol?.feeLabel || '?'} FEE + ${form.initialBuy || '0'} ETH BUY\nSTATUS ....... ${protocol?.enabled ? 'PROTOCOL ENABLED' : 'NOT READY'}`}</pre>
        {!result && <button className="broadcast" disabled={busy || !session?.eligible || !protocol?.enabled} onClick={launch}>
          &lt; {busy ? 'SIMULATING / WAITING...' : 'SIMULATE + CONFIRM MAINNET LAUNCH'} &gt;
        </button>}
        {result && <div className="tx-success">
          <b>LAUNCH CONFIRMED</b>
          <span>TOKEN: {result.token || 'READ EVENT IN EXPLORER'}</span>
          <span>CURVE: {result.curve || 'READ EVENT IN EXPLORER'}</span>
          <a href={`${EXPLORER_URL}/tx/${result.hash}`} target="_blank" rel="noreferrer">[OPEN TRANSACTION {short(result.hash)}]</a>
        </div>}
      </div>}

      {error && <div className="real-error">ERROR: {error}</div>}
      <div className="dialog-actions">
        <button onClick={() => step > 1 ? setStep(step - 1) : close()}>&lt; {step > 1 ? 'BACK' : 'CANCEL'}</button>
        {step < 4 && <button disabled={step === 1 && !session} onClick={() => { setError(''); setStep(step + 1) }}>NEXT &gt;</button>}
      </div>
    </div>
  )
}
