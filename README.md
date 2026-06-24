# Arcanum

A private on-chain messenger for Arc Network Testnet.

## Features

- Wallet connection with wagmi.
- Arc Network Testnet chain switching.
- On-chain public messages through `ArcanumMessenger`.
- Client-side encrypted private messages using browser ECDH + AES-GCM.
- Inbox and Sent views backed by contract reads.
- Encryption public key registration on-chain.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the real Arc Network values in `.env.local` before using production or testnet wallets:

```bash
NEXT_PUBLIC_CHAIN_ID=
NEXT_PUBLIC_RPC_URL=
NEXT_PUBLIC_EXPLORER_URL=
NEXT_PUBLIC_CONTRACT_ADDRESS=
```

## Contract Workflow

```bash
npm run compile:contracts
npm run test:contracts
DEPLOYER_PRIVATE_KEY=0x... ARC_TESTNET_RPC_URL=https://... NEXT_PUBLIC_CHAIN_ID=... npm run deploy:arc
```

After deployment, copy the deployed address into `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel/Netlify and `.env.local`.

## Build

```bash
npm run build
```
