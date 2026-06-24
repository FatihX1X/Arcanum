# Arcanum

A private on-chain messenger for Arc Network Testnet.

## Features

- Wallet connection with wagmi.
- Arc Testnet chain switching.
- On-chain public messages through `ArcanumMessenger`.
- Client-side encrypted private messages using browser ECDH + AES-GCM.
- Inbox and Sent views backed by contract reads.
- Encryption public key registration on-chain.

## Arc Testnet

- Chain ID: `5042002`
- RPC URL: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Native gas token: `USDC`
- ArcanumMessenger: `0xC5E634BBA75bB25758E15247E7C07Da889301584`

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The default config points to the deployed Arc Testnet contract. Override it in `.env.local` only when deploying a new contract:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
```

## Contract Workflow

Fund the deployer wallet with Arc Testnet USDC for gas, then run:

```bash
npm run compile:contracts
npm run test:contracts
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:arc
```

After deployment, copy the deployed address into `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel/Netlify and `.env.local`.

## Build

```bash
npm run build
```
