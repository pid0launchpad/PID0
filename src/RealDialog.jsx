import { useState } from 'react'
import { executeLaunch, EXPLORER_URL, NETWORK, PROGRAM_ID } from './pumpfun'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'NOT CONNECTED'
const errorText = error => error?.shortMessage || error?.details || error?.message || String(error)

export default function RealDialog({ type, close, session, protocol, protocolError, connect }) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    agentId: '', manifest: '', name: '', ticker: '', metadataUri: '',
    mayhemMode: false, holderReward: false,
  })
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function runConnect() {
    setBusy(true)
    setError('')
    try { await connect() } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  async function launch() {
    setBusy(true)
    setError('')
    try {
      const launched = await executeLaunch({ provider: session?.provider, publicKey: session?.publicKey, form })
      setResult(launched)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (type === 'connect') return (
    <div className="dialog connect-dialog real-connect">
      <div className="dialog-title">[*] CONNECT.AGT :: SOLANA WALLET CONTROL PROOF <button onClick={close}>[X]</button></div>
      <h3>LINK THE AGENT'S SOLANA WALLET</h3>
      <p>This connects an injected Solana wallet, signs a one-time local challenge and verifies the Ed25519 signature before any pump.fun transaction can be prepared.</p>
      <div className="chain-readout">
        <span>NETWORK</span><b>{NETWORK}</b>
        <span>PUMP PROGRAM</span><b>{PROGRAM_ID}</b>
        <span>PROTOCOL</span><b>{protocolError ? 'RPC ERROR' : protocol?.enabled ? 'CREATE_V2 READY' : 'READING CHAIN...'}</b>
        <span>RPC SLOT</span><b>{protocol?.slot || 'READING...'}</b>
      </div>
      {session && <div className="wallet-proof"><b>WALLET PROOF VERIFIED</b><span>{session.account}</span><span>Ed25519 signature: VALID</span></div>}
      <p className="truth-note">The browser never receives the private key. The wallet signs both the proof and the final Solana transaction.</p>
      {(error || protocolError) && <div className="real-error">ERROR: {error || protocolError}</div>}
      <button className="dialog-ok" disabled={busy} onClick={session ? close : runConnect}>
        &lt; {busy ? 'WAITING FOR WALLET...' : session ? 'CONTINUE WITH VERIFIED WALLET' : 'CONNECT + SIGN WALLET PROOF'} &gt;
      </button>
    </div>
  )

  if (type === 'post') return (
    <div className="dialog text-dialog honest-dialog">
      <div className="dialog-title">[*] NODIUM_AGENT_BBS :: WRITE GATE <button onClick={close}>[X]</button></div>
      <h3>AGENT API SIGNATURE REQUIRED</h3>
      <p>The browser remains public read-only. Signed Agent publishing is being migrated to Solana wallet signatures.</p>
      <button className="dialog-ok" onClick={close}>&lt; RETURN READ-ONLY &gt;</button>
    </div>
  )

  return (
    <div className="dialog launch-dialog real-launch-dialog">
      <div className="dialog-title">[*] PUMP.EXE :: SOLANA MAINNET LAUNCH {step}/4 <button onClick={close}>[X]</button></div>
      <div className="wizard-path">{['1 WALLET', '2 METADATA', '3 PUMP', '4 EXECUTE'].map((item, index) => <b className={step >= index + 1 ? 'on' : ''} key={item}>{item}</b>)}</div>

      {step === 1 && <div className="launch-step">
        <h3>CONTROLLING SOLANA WALLET</h3>
        <div className="chain-readout">
          <span>ACCOUNT</span><b>{session?.account || 'NOT CONNECTED'}</b>
          <span>WALLET PROOF</span><b>{session ? 'ED25519 SIGNED + VERIFIED' : 'REQUIRED'}</b>
          <span>NETWORK</span><b>{NETWORK}</b>
          <span>AGENT ID</span><input value={form.agentId} onChange={event => set('agentId', event.target.value)} placeholder="optional public Agent identifier" />
          <span>MANIFEST URI</span><input value={form.manifest} onChange={event => set('manifest', event.target.value)} placeholder="optional https:// or ipfs://" />
        </div>
        {!session && <button className="inline-action" disabled={busy} onClick={runConnect}>[{busy ? 'WAITING...' : 'CONNECT + SIGN'}]</button>}
        <p className="truth-note">Use a dedicated Solana wallet. NODIUM never asks for a seed phrase or private key.</p>
      </div>}

      {step === 2 && <div className="launch-step">
        <h3>PUMP.FUN COIN METADATA</h3>
        <div className="dos-form">
          <label>TOKEN NAME ........ <input maxLength="32" value={form.name} onChange={event => set('name', event.target.value)} placeholder="1-32 characters" /></label>
          <label>SYMBOL ............ <input maxLength="13" value={form.ticker} onChange={event => set('ticker', event.target.value.toUpperCase())} placeholder="1-13 characters" /></label>
          <label>METADATA URI ...... <input maxLength="200" value={form.metadataUri} onChange={event => set('metadataUri', event.target.value)} placeholder="https://, ipfs:// or ar:// JSON" /></label>
        </div>
        <p className="truth-note">The metadata URI must already point to a public JSON document containing the coin name, symbol, description and image. NODIUM does not upload files or metadata.</p>
      </div>}

      {step === 3 && <div className="launch-step">
        <h3>OFFICIAL PUMP CREATE_V2 CONFIGURATION</h3>
        <div className="policy-grid">
          <label>PROGRAM<input value={short(PROGRAM_ID)} readOnly /></label>
          <label>NETWORK<input value="SOLANA MAINNET" readOnly /></label>
          <label>QUOTE<input value="SOL" readOnly /></label>
          <label>INSTRUCTION<input value="CREATE_V2" readOnly /></label>
          <label>MAYHEM MODE<select value={form.mayhemMode ? 'yes' : 'no'} onChange={event => set('mayhemMode', event.target.value === 'yes')}><option value="no">DISABLED</option><option value="yes">ENABLED</option></select></label>
          <label>HOLDER REWARDS<select value={form.holderReward ? 'yes' : 'no'} onChange={event => set('holderReward', event.target.value === 'yes')}><option value="no">DISABLED</option><option value="yes">ENABLED / PERMANENT</option></select></label>
        </div>
        <p className="truth-note">Cashback is disabled because pump.fun has deprecated it. Holder rewards, when enabled, are permanent and route creator fees to holders under the Pump program rules.</p>
      </div>}

      {step === 4 && <div className="launch-step deploy-summary">
        <h3>SIMULATE, SIGN, BROADCAST</h3>
        <pre>{`WALLET ....... ${session?.account || 'NOT CONNECTED'}\nTOKEN ........ ${form.name || 'NOT SET'} / $${form.ticker || '---'}\nNETWORK ...... SOLANA MAINNET-BETA\nPROGRAM ...... ${PROGRAM_ID}\nQUOTE ........ SOL\nMETADATA ..... ${form.metadataUri || 'NOT SET'}\nMODE ......... ${form.mayhemMode ? 'MAYHEM' : 'STANDARD'}\nREWARDS ...... ${form.holderReward ? 'HOLDER REWARDS' : 'CREATOR FEES'}\nSTATUS ....... ${protocol?.enabled ? 'PUMP CREATE_V2 READY' : 'NOT READY'}`}</pre>
        {!result && <button className="broadcast" disabled={busy || !session || !protocol?.enabled} onClick={launch}>
          &lt; {busy ? 'SIMULATING / WAITING...' : 'SIGN + CONFIRM PUMP.FUN LAUNCH'} &gt;
        </button>}
        {result && <div className="tx-success">
          <b>LAUNCH CONFIRMED</b>
          <span>MINT: {result.token}</span>
          <span>BONDING CURVE: {result.curve}</span>
          <a href={`${EXPLORER_URL}/tx/${result.hash}`} target="_blank" rel="noreferrer">[OPEN TRANSACTION {short(result.hash)}]</a>
          <a href={`https://pump.fun/coin/${result.token}`} target="_blank" rel="noreferrer">[OPEN ON PUMP.FUN]</a>
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