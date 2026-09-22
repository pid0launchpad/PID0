import { NETWORK, PROGRAM_ID } from './pumpfun'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'NOT LINKED'

export default function LiveAccessPanel({ session, protocol, protocolError, onConnect, onLaunch }) {
  return (
    <section className="frame access-launch-panel real-access-panel" id="access">
      <div className="frame-title"><span>|- AGENT :: ACCESS + TOKEN LAUNCH -|</span><b>LIVE PUMP PROGRAM</b></div>
      <div className="info-scroll">
        <div className="info-intro">
          <b>SOLANA MAINNET TOKEN CREATION THROUGH THE OFFICIAL PUMP SDK.</b>
          <p>The browser checks the deployed Pump program, builds a create_v2 instruction locally, simulates the signed transaction through Solana RPC and broadcasts only after the connected wallet approves it.</p>
        </div>
        <div className="live-protocol-grid">
          <span>NETWORK</span><b>{NETWORK}</b>
          <span>PROGRAM</span><b>{short(PROGRAM_ID)}</b>
          <span>RPC READ</span><b>{protocolError ? 'FAILED' : protocol ? 'VERIFIED' : 'LOADING'}</b>
          <span>CREATE_V2</span><b>{protocol?.enabled ? 'READY' : 'CHECKING'}</b>
          <span>QUOTE ASSET</span><b>SOL</b>
          <span>RPC SLOT</span><b>{protocol?.slot || 'READING'}</b>
          <span>WALLET</span><b>{short(session?.account)}</b>
          <span>SIGNATURE</span><b>{session ? 'ED25519 VERIFIED' : 'CHECK AFTER LINK'}</b>
        </div>
        {protocolError && <p className="real-error">RPC ERROR: {protocolError}</p>}
        <div className="info-actions">
          <button onClick={onConnect}>[01] LINK + PROVE SOLANA WALLET</button>
          <button onClick={onLaunch}>[02] OPEN LIVE PUMP LAUNCH</button>
        </div>
        <div className="info-chapter">
          <b>WHAT IS WORKING NOW</b>
          <p>Phantom-compatible wallet connection, Ed25519 challenge signing, Pump program checks, mint generation, official SDK instruction building, wallet signing, RPC simulation, broadcasting and confirmation are implemented against Solana mainnet-beta.</p>
        </div>
        <div className="info-chapter">
          <b>METADATA REQUIREMENT</b>
          <p>Pump create_v2 accepts a public metadata URI. Upload the image and JSON before launching, then provide an HTTPS, IPFS or Arweave URI. Token names are limited to 32 characters, symbols to 13 and URIs to 200.</p>
        </div>
        <div className="info-chapter">
          <b>PUMP OPTIONS</b>
          <p>New coins use SOL as the quote asset. Mayhem mode is optional. Holder rewards are optional and permanent when enabled. Deprecated cashback mode is always disabled.</p>
        </div>
        <div className="info-chapter">
          <b>MAINNET SAFETY</b>
          <p>The final action targets the live Pump program. The new mint key is generated in the browser, the transaction is simulated before broadcast and the wallet retains custody. Cancelling the wallet request sends nothing.</p>
        </div>
      </div>
    </section>
  )
}