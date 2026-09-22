import { useEffect, useState } from 'react'
import { apiUrl } from './api'

export default function LiveRulesPanel() {
  const [record, setRecord] = useState(null)
  const [state, setState] = useState('CHECKING')
  useEffect(() => {
    let active = true
    fetch(apiUrl('/api/v1/rules'), { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => { if (active) { setRecord(data); setState('VERIFIED') } })
      .catch(() => { if (active) setState('LOCAL COPY') })
    return () => { active = false }
  }, [])

  return (
    <section className="frame detailed-rules-panel real-rules-panel" id="rules">
      <div className="frame-title"><span>|- SYSTEM :: NODIUM RULES -|</span><b>V{record?.version || '2.0.0'} / {state}</b></div>
      <div className="info-scroll">
        <div className="info-intro">
          <b>NODIUM BUILDS PUMP CREATE TRANSACTIONS; THE SOLANA WALLET REMAINS IN CONTROL.</b>
          <p>These rules describe the live browser launcher, Registry and public forum. They do not certify a token, its creator or its future market behavior.</p>
        </div>
        <div className="info-chapter">
          <b>WALLET CONTROL</b>
          <p>The browser connects to a Phantom-compatible Solana provider and requests a one-time Ed25519 signature. A valid signature proves control of that public key at that moment. The private key and seed phrase never enter NODIUM.</p>
        </div>
        <div className="info-chapter">
          <b>HOW TOKEN CREATION WORKS</b>
          <p>NODIUM uses the official pump.fun TypeScript SDK to build a Pump create_v2 instruction for Solana mainnet-beta. The user supplies a public metadata URI, and a fresh Token-2022 mint keypair is generated locally for the transaction.</p>
          <p>The connected wallet is the payer, user and creator. The mint and wallet sign locally. NODIUM simulates the signed transaction through Solana RPC before broadcasting it.</p>
        </div>
        <div className="info-chapter">
          <b>WHAT A CONFIRMED LAUNCH MEANS</b>
          <p>A confirmed launch means Solana accepted a transaction that invoked the deployed Pump program and created the displayed mint. The mint and transaction remain independently inspectable through Solscan and pump.fun.</p>
          <p>Confirmation is not an audit, endorsement, liquidity guarantee or investment recommendation. Metadata is supplied externally and may be false, unavailable or changed at its host.</p>
        </div>
        <div className="info-chapter">
          <b>LAUNCH INPUTS</b>
          <p>Pump limits names to 32 characters, symbols to 13 and metadata URIs to 200. NODIUM launches SOL-paired coins. Cashback stays disabled because Pump deprecated it. Holder rewards and Mayhem mode are explicit user choices.</p>
        </div>
        <div className="info-chapter">
          <b>SECURITY AND RESPONSIBILITY</b>
          <p>Wallet owners remain responsible for key security, SOL funding, token metadata, selected Pump modes and every transaction they approve. Solana transactions cannot be reversed by NODIUM.</p>
          <p>A failed simulation is not broadcast. Network congestion, RPC outages, wallet incompatibility or Pump program changes can still prevent a launch.</p>
        </div>
        <div className="info-chapter">
          <b>PUBLIC DATA</b>
          <p>Public mint addresses, transaction signatures and forum content may be displayed by NODIUM. Unknown values remain marked as unknown. Solana transaction data is the final source for launch confirmation.</p>
        </div>
        <div className="info-chapter rule-end">
          <b>WORKING PRINCIPLE</b>
          <p>Verify wallet control. Build with the official Pump SDK. Simulate before broadcast. Confirm on Solana. Keep unverified claims and unpublished addresses clearly marked.</p>
        </div>
      </div>
    </section>
  )
}