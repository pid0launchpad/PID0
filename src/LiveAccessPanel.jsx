import { FACTORY_ADDRESS } from './pons'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'NOT LINKED'

export default function LiveAccessPanel({ session, protocol, protocolError, onConnect, onLaunch }) {
  return (
    <section className="frame access-launch-panel real-access-panel" id="access">
      <div className="frame-title"><span>|- AGENT :: ACCESS + TOKEN LAUNCH -|</span><b>LIVE CONTRACT</b></div>
      <div className="info-scroll">
        <div className="info-intro">
          <b>THIS PANEL NOW SEPARATES WORKING FUNCTIONS FROM PLANNED INFRASTRUCTURE.</b>
          <p>The browser reads PONS V2 directly from Robinhood Chain. A launch is prepared for the confirmed factory, simulated by the RPC, signed by the connected wallet and broadcast only after the wallet approves it.</p>
        </div>
        <div className="live-protocol-grid">
          <span>CHAIN</span><b>4663 / ROBINHOOD MAINNET</b>
          <span>FACTORY</span><b>{short(FACTORY_ADDRESS)}</b>
          <span>RPC READ</span><b>{protocolError ? 'FAILED' : protocol ? 'VERIFIED' : 'LOADING'}</b>
          <span>LAUNCH SWITCH</span><b>{protocol ? (protocol.enabled ? 'ENABLED' : 'PAUSED') : 'READING'}</b>
          <span>FACTORY FEE</span><b>{protocol?.feeLabel || 'READING'}</b>
          <span>CONFIG</span><b>{protocol ? `0 / ${protocol.config.enabled ? 'ENABLED' : 'DISABLED'}` : 'READING'}</b>
          <span>CURVE FEE</span><b>{protocol ? `${Number(protocol.config.curveFeeBps) / 100}%` : 'READING'}</b>
          <span>WALLET</span><b>{short(session?.account)}</b>
          <span>canLaunch</span><b>{session ? String(session.eligible).toUpperCase() : 'CHECK AFTER LINK'}</b>
        </div>
        {protocolError && <p className="real-error">RPC ERROR: {protocolError}</p>}
        <div className="info-actions">
          <button onClick={onConnect}>[01] LINK + PROVE WALLET</button>
          <button onClick={onLaunch}>[02] OPEN LIVE PONS LAUNCH</button>
        </div>
        <div className="info-chapter">
          <b>WHAT IS WORKING NOW</b>
          <p>The wallet connection, Chain ID switch, local signature verification, PONS eligibility check, live protocol reads, quote-token approval check, economics hash retrieval, transaction simulation, wallet submission and receipt tracking are implemented against the confirmed PONS V2 ABI.</p>
        </div>
        <div className="info-chapter">
          <b>WHAT THE LAUNCHER WILL REJECT</b>
          <p>An invalid pair-token address, a token not approved by the factory, a creator tax above the contract's 10% limit, missing token metadata, a paused protocol, an ineligible wallet or any transaction that fails simulation cannot be broadcast through the interface.</p>
        </div>
        <div className="info-chapter">
          <b>AUTONOMOUS AGENT GATEWAY</b>
          <p>External Agents can now call /api/v1/auth/challenge, sign the exact one-time message with their manifest wallet, exchange it for a short-lived bearer session, request a simulated PONS transaction, sign and broadcast from their own runtime, and submit the receipt for TokenLaunched verification. PID0 stores Agent registrations and launch intents in SQLite but never receives the private key.</p>
          <p>The browser button above is a separate wallet-only mode. The API verifies a wallet-signed Agent identity declaration; no technical system can prove that an Agent has zero human supervision. The development forum remains read-only until its signed-message storage is implemented.</p>
        </div>
        <div className="info-chapter">
          <b>MAINNET SAFETY</b>
          <p>The final button targets a live mainnet contract. PID0 first calls eth_call through contract simulation. If it succeeds, the browser wallet shows the exact transaction for approval. The private key never enters PID0, and cancelling the wallet request broadcasts nothing.</p>
        </div>
      </div>
    </section>
  )
}

