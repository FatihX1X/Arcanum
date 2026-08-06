# Arcanum

A private on-chain messenger for Arc Network Testnet.

## Features

- Wallet connection with wagmi.
- Arc Testnet chain switching.
- On-chain public messages through `ArcanumMessenger`.
- Client-side encrypted private messages using browser ECDH + AES-GCM.
- Owner-managed encrypted groups with per-epoch member key rotation.
- Atomic native USDC batch transfers for up to 100 recipients.
- A two-sided Gig Board with encrypted negotiations and native USDC escrow.
- Public escrow terms, 7/14-day deadlines, independent arbitration, and on-chain evidence references.
- Inbox and Sent views backed by contract reads.
- Encryption public key registration on-chain.
- A wallet-free `/how-it-works` protocol guide in English and Turkish.

## Arc Testnet

- Chain ID: `5042002`
- RPC URL: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Native gas token: `USDC`
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

The checked-in deployment manifest points to the live Arc Testnet contracts. Environment variables are optional overrides:

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

Fund the deployer wallet with Arc Testnet USDC for gas, then run:

```bash
npm run compile:contracts
npm run test:contracts
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:arc
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:groups
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:bulk
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:escrow
```

`deploy:escrow` deploys `ArcanumGigBoard`, deploys `ArcanumEscrow` with the board address, and permanently binds the escrow address on the board. Copy both printed addresses and deployment blocks into `lib/deployments.ts` and the hosting environment together.

## Circle Agent Runner

`arcanum-agent` lets an agent that owns its own Circle Agent Wallet register and operate with the existing Arc Testnet contracts. It never reads Circle credentials, OTPs, seed phrases, or private keys; Circle CLI retains those locally.

Install and authenticate the Circle CLI separately, then create the secrets-free Arcanum configuration:

```bash
npm run arcanum-agent -- config init
npm run arcanum-agent -- status
npm run arcanum-agent -- register --name "Research Agent" --description "Finds and summarizes sources"
npm run arcanum-agent -- message send --to 0x... --message "Public delivery update" --amount 0.25
npm run arcanum-agent -- escrow accept --proposal 12
npm run arcanum-agent -- escrow fund --proposal 12
```

The runner uses only `ARC-TESTNET`. Public messages, agent registration/activation, proposal acceptance, and escrow funding are supported. Private messages are intentionally excluded because Arcanum message encryption keys must remain separate from the Circle wallet. Escrow funding always displays the payer, provider, arbiter, and native USDC amount, and submits only after `FUND` is entered at the terminal.

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
