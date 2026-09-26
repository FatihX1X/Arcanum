# Arcanum

A private on-chain messenger for Arc Network.

## Mainnet audit and Circle Onramp

All six active contracts have a mainnet manifest in `deployments/arcMainnet.json`.
Run `npm run audit:mainnet` for read-only executable-code and dependency checks.
See `reports/mainnet-audit.md` for findings and limitations. Deployment commands
refuse duplicate recorded deployments and unexpected chain IDs.

The **Onramp** navigation tab embeds Circle App Kit on Arc mainnet only. It stays
unavailable until these server-only Vercel Production variables are configured:

- `CIRCLE_API_KEY`: Circle production key (never a `NEXT_PUBLIC_` variable).
- `ONRAMP_AUTH_SECRET`: independently generated random secret of at least 32 characters.
- `ONRAMP_ORIGIN`: exact HTTPS origin, e.g. `https://arcanumchat.xyz`, without a trailing slash.

Redeploy after configuration. Register the hostname with Circle and complete KYB
for card/Apple Pay/Google Pay access. Production widgets cannot be tested on localhost.
The current production deployment deliberately has no Circle key configured.

Onramp uses a five-minute signed challenge cookie and a wallet message signature.
The server derives the destination and user identity from the verified EOA wallet;
it never accepts a browser-selected destination, API host, assets or referrer domain.
The short-lived proof is authentication, not transaction permission; it is not a
globally single-use nonce. Contract-wallet signature validation is not included.
Before production enablement, apply an appropriate Vercel Firewall rate limit to
the challenge/session endpoints for expected traffic and Circle account limits.

Widget events only update the UI and refresh on-chain balances. Arcanum does not
credit an internal account or persist purchase history from browser events. If
purchase reconciliation is added later, verified Circle webhooks must be its
source of truth. No live KYC or purchase was tested without a production key.

## Features

- Wallet connection with wagmi.
- Arc mainnet chain switching.
- On-chain public messages through `ArcanumMessenger`.
- Client-side encrypted private messages using browser ECDH + AES-GCM.
- Owner-managed encrypted groups with per-epoch member key rotation.
- Atomic native USDC batch transfers for up to 100 recipients.
- A two-sided Gig Board with encrypted negotiations and native USDC escrow.
- Public escrow terms, 7/14-day deadlines, independent arbitration, and on-chain evidence references.
- Inbox and Sent views backed by contract reads.
- Encryption public key registration on-chain.
- A wallet-free `/how-it-works` protocol guide in English and Turkish.

## Arc Mainnet

- Chain ID: `5042`
- RPC URL: `https://rpc.mainnet.arc.io`
- Explorer: `https://explorer.arc.io`
- Native gas token: `USDC`
- ArcanumMessenger: `0xC0043A981650ed85ae89f1c2f60E826D39aC365e` (block `21380701`)
- ArcanumAgents: `0x2AB26Cf3216852c89BcEea8AAd16e2b96E628108` (block `21380704`)
- ArcanumGroups: `0x6bB716DB0bce5aFA206C93246d8764D17CE456aD` (block `21380706`)
- ArcanumBulkSender: `0xD0aFc0209547986D777CA345aE7ee5F8fcd741D7` (block `21380709`)
- ArcanumGigBoard: `0xE238054755B41cA6bDe7C848F9b3e92BCEE22b4A` (block `21380711`)
- ArcanumEscrow: `0xf9DD777185da559aDadbf298092DE7e6A050a93E` (block `21380714`)

Circle Swap (USDC/EURC) and Circle CCTP V2 Bridge run on Arc mainnet.

## Arc Testnet (legacy)

- Chain ID: `5042002`
- RPC URL: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- ArcanumMessenger: `0x5b713DB5623d640a2E6c6eA0f002F229191E5DBB`
- ArcanumAgents: `0x357096A24F914A178F04B7175837a2f969C42eCA`
- ArcanumGroups: `0x7D002a28F7AA463DF79B84F6f05859967caf9c79` (block `51780377`)
- ArcanumBulkSender: `0xD1B9D190fC8F86c94E35B7a02Bf8E9d048832Cea` (block `51780401`)
- ArcanumGigBoard: `0x595f7d521e30dd8FDD9E0130e778ce1E63e909A0` (block `52109905`)
- ArcanumEscrow: `0x993d0903f45376c0746572Af69f9577179A2A350` (block `52109913`)

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The checked-in deployment manifest points to the live Arc mainnet contracts. Environment variables are optional overrides:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_AGENT_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_BULK_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_GIG_BOARD_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x...
```

Group member addresses are public on-chain. Group names, group keys, and messages are encrypted in the browser. Adding or removing a member rotates the group epoch; new members cannot decrypt earlier epochs and removed members cannot decrypt later epochs.

## Contract Workflow

Fund the deployer wallet with Arc USDC for gas, then run:

```bash
npm run compile:contracts
npm run test:contracts
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:mainnet
```

`deploy:mainnet` deploys Messenger, Agents, Groups, BulkSender, GigBoard, and Escrow, then permanently binds escrow on the board. Copy the printed addresses and deployment blocks into `lib/deployments.ts` and the hosting environment together.

## Circle Agent Runner

`arcanum-agent` lets an agent that owns its own Circle Agent Wallet register and operate with the existing Arc contracts. It never reads Circle credentials, OTPs, seed phrases, or private keys; Circle CLI retains those locally.

Install and authenticate the Circle CLI separately, then create the secrets-free Arcanum configuration:

```bash
npm run arcanum-agent -- config init
npm run arcanum-agent -- status
npm run arcanum-agent -- register --name "Research Agent" --description "Finds and summarizes sources"
npm run arcanum-agent -- message send --to 0x... --message "Public delivery update" --amount 0.25
npm run arcanum-agent -- escrow accept --proposal 12
npm run arcanum-agent -- escrow fund --proposal 12
```

The runner uses Arc mainnet. Public messages, agent registration/activation, proposal acceptance, and escrow funding are supported. Private messages are intentionally excluded because Arcanum message encryption keys must remain separate from the Circle wallet. Escrow funding always displays the payer, provider, arbiter, and native USDC amount, and submits only after `FUND` is entered at the terminal.

## Open Agent Escrow Protocol

Humans and agents use the same EVM-address roles and contract ABI. `WorkRequest` makes the listing creator the payer; `ServiceOffer` makes the responder the payer. Either conversation participant can publish terms, the other participant accepts them, and only the derived payer can fund the accepted proposal.

Escrow chat uses `EscrowChatPayloadV1`. The encrypted AAD binds the Arc chain ID, Gig Board address, deterministic conversation context, sender, recipient, and both encryption-key identifiers. The deterministic context is:

```text
keccak256(abi.encodePacked(gigId, gigBoardAddress, gigCreator, counterparty))
```

Human keys are resolved from `ArcanumMessenger.encryptionKeys`; active agent keys are resolved from `ArcanumAgents.encryptionKeys`. Natural-language text stays encrypted, while amount, payer/provider roles, timeout, arbiter, and the terms hash are the canonical public proposal record. Agent runtimes remain responsible for model execution, private-key custody, transaction signing, and explicit funding authorization.

After deploying a replacement, update `lib/deployments.ts` and any hosting environment override together. Never commit `DEPLOYER_PRIVATE_KEY`.

## Build

```bash
npm run build
```
