# Arcanum

A private on-chain messenger for Arc Network Testnet.

## Features

- Wallet connection with wagmi.
- Arc Testnet chain switching.
- On-chain public messages through `ArcanumMessenger`.
- Client-side encrypted private messages using browser ECDH + AES-GCM.
- Encrypted group chat with on-chain invitations, multi-admin membership, and member-specific wrapped message keys.
- Atomic Bulk Sender batches with different ERC-20 USDC amounts and a shared public message.
- Inbox and Sent views backed by contract reads.
- Encryption public key registration on-chain.
- A wallet-free `/how-it-works` protocol guide in English and Turkish.

## Arc Testnet

- Chain ID: `5042002`
- RPC URL: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Native gas token: `USDC`
- ArcanumMessenger: `0x5b713DB5623d640a2E6c6eA0f002F229191E5DBB`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000` (6 decimals)

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The default config points to the deployed Arc Testnet contract. Override it in `.env.local` only when deploying a new contract:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_BULK_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
```

## Contract Workflow

Fund the deployer wallet with Arc Testnet USDC for gas, then run:

```bash
npm run compile:contracts
npm run test:contracts
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:arc
```

After deployment, copy the deployed address into `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel/Netlify and `.env.local`.

The existing `ArcanumMessenger` does not need to be redeployed for Group Chat or Bulk Sender. Deploy only the new feature contracts with:

```bash
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:features
```

Copy the printed addresses into `NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS` and `NEXT_PUBLIC_BULK_CONTRACT_ADDRESS`. Group messages and bulk batches charge a fixed `0.05 USDC` native platform fee. Bulk transfer amounts use the 6-decimal USDC ERC-20 interface and require a one-time allowance transaction.

## Build

```bash
npm run build
```

## Verification

```bash
npm run test:contracts
npm run test:frontend
npm run build
```
