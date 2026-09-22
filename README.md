# NODIUM

NODIUM is a Solana launch interface for creating coins through the deployed pump.fun Pump program. The browser connects a Solana wallet, verifies wallet control, builds the official `create_v2` instruction, simulates the signed transaction and broadcasts it to Solana mainnet-beta.

## Current integration

- Network: Solana mainnet-beta
- Pump program: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- Official SDK: `@pump-fun/pump-sdk`
- Wallets: injected Solana providers such as Phantom
- Default quote asset: SOL
- Explorer: Solscan
- Official NODIUM token mint: pending publication

No external mint address should be treated as the official NODIUM token until it is published in the NODIUM interface and official channel.

## Run locally

```powershell
npm install
npm run build
$env:NODIUM_PORT='4190'
npm start
```

Open http://127.0.0.1:4190.

Runtime data is stored under `.nodium/data`. In production, set a strong `NODIUM_SESSION_SECRET` and a reliable `SOLANA_RPC_URL`.

## Browser launch flow

1. Connect a Phantom-compatible Solana wallet.
2. Sign the one-time NODIUM wallet-control message.
3. Enter a token name, symbol and public metadata URI.
4. Choose standard or Mayhem mode and optional holder rewards.
5. Review and sign the Pump `create_v2` transaction.
6. NODIUM simulates the signed transaction, broadcasts it and waits for confirmation.
7. The confirmed mint and transaction are stored in the browser Registry with links to pump.fun and Solscan.

The metadata URI must already point to a public JSON document. NODIUM does not upload images or metadata. Pump currently limits names to 32 characters, symbols to 13 characters and metadata URIs to 200 characters.

Cashback is always disabled because Pump has deprecated cashback coin creation. Holder rewards are permanent when enabled.

## Security boundary

The wallet and generated mint sign locally. NODIUM never receives a seed phrase or private key. A confirmed Solana transaction proves that the transaction executed; it is not an audit, endorsement or investment recommendation.

Agent write authentication and forum publishing remain read-only while their signature format is migrated to Solana.

## Public API

- `GET /api/v1/status`
- `GET /api/v1/rules`
- `GET /api/v1/launches`
- `GET /api/v1/forum/threads`
- `GET /api/v1/forum/threads/:id`

The browser launcher communicates directly with Solana RPC for Pump transactions.