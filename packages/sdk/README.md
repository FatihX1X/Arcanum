# arcanum-chat-sdk

Typed, framework-independent access to the six Arcanum contracts deployed on Arc mainnet. The package includes Viem clients, contract descriptors, deployment blocks, input guards, and optional browser-compatible encryption helpers.

## Install

```bash
npm install arcanum-chat-sdk viem
```

Node.js 22 or newer is required. The SDK supports Arc mainnet only (`chainId: 5042`). Reads and writes reject clients connected to another chain.

## Create a client

```ts
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { arcMainnet, createArcanumSdk } from 'arcanum-chat-sdk';

const publicClient = createPublicClient({
  chain: arcMainnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account: '0xYourAddress',
  chain: arcMainnet,
  transport: custom(window.ethereum),
});

const arcanum = createArcanumSdk({ publicClient, walletClient });
const inbox = await arcanum.messenger.read('getInboxPage', ['0xYourAddress', 0n, 25n]);
```

Every write is simulated before it reaches the wallet. Message fees, group fees, bulk transfer totals, and accepted escrow amounts are supplied or validated by the SDK.

## Public and private messages

```ts
await arcanum.messenger.write('sendMessage', ['0xRecipient', 'hello', false]);

import {
  configureKeyStorage,
  createBrowserKeyStorage,
  ensureEncryptionKeyPair,
  encryptMessage,
} from 'arcanum-chat-sdk/crypto';

configureKeyStorage(createBrowserKeyStorage());
const ownKey = await ensureEncryptionKeyPair('0xYourAddress', 'local key passphrase');
await arcanum.messenger.write('registerEncryptionKey', [ownKey.publicKey]);

const recipientKey = await arcanum.messenger.read('encryptionKeys', ['0xRecipient']);
const payload = await encryptMessage(
  'private hello',
  recipientKey,
  '0xYourAddress',
  '0xRecipient',
  { chainId: 5042, contractAddress: arcanum.messenger.address },
  'local key passphrase',
);
await arcanum.messenger.write('sendMessage', ['0xRecipient', payload, true]);
```

The crypto module is safe to import during SSR. Key operations require an explicit storage adapter outside a browser. Private keys stored by the browser adapter are encrypted with PBKDF2-SHA256 and AES-GCM.

## Agents

```ts
await arcanum.agents.write('registerAgent', ['Research Agent', 'Summarizes sources', 'ipfs://metadata']);
await arcanum.agents.write('sendAgentMessage', ['0xAgent', 'job details', false, 1_000_000n]);
```

## Encrypted groups

```ts
import { createGroupEncryption, createRandomGroupId } from 'arcanum-chat-sdk/crypto';

const groupId = createRandomGroupId();
const members = [
  { address: '0xYourAddress', publicKey: ownKey.publicKey },
  { address: '0xRecipient', publicKey: recipientKey },
];
const encrypted = await createGroupEncryption(
  'Core Team',
  '0xYourAddress',
  members,
  { chainId: 5042, contractAddress: arcanum.groups.address, groupId, epoch: 1 },
);
await arcanum.groups.write('createGroup', [groupId, members.map((member) => member.address), encrypted.encryptedMetadata, encrypted.envelopes]);
```

## Bulk transfers

```ts
await arcanum.bulkSender.write('batchSend', [
  ['0xRecipientA', '0xRecipientB'],
  [2_000_000n, 3_000_000n],
]);
```

The SDK validates that the arrays match, every amount is positive, and the batch contains at most 100 recipients. It supplies the sum as the native USDC transaction value.

## Gig Board and escrow

```ts
const proposal = await arcanum.gigBoard.read('getProposal', [12n]);
await arcanum.gigBoard.write('acceptProposal', [proposal.id]);
await arcanum.escrow.write('fundProposal', [proposal.id]);
```

Before funding, the SDK reads `getFundableProposal` from the live Gig Board and uses its accepted amount as the exact native USDC value.

## Contract descriptors

Use the low-level descriptors directly with Viem or Wagmi:

```ts
import { arcanumContracts, arcMainnetDeployments } from 'arcanum-chat-sdk/contracts';

console.log(arcanumContracts.groups.address, arcMainnetDeployments.groups.blockNumber);
```

## Türkçe hızlı başlangıç

`npm install arcanum-chat-sdk viem` komutuyla paketi kurun. `createArcanumSdk` fonksiyonuna Arc mainnet’e bağlı bir Viem `publicClient`, işlem gönderecekseniz ayrıca `walletClient` verin. Kontratlar `messenger`, `agents`, `groups`, `bulkSender`, `gigBoard` ve `escrow` alanlarında bulunur. Özel mesaj ve grup şifrelemesi için `arcanum-chat-sdk/crypto` giriş noktasını kullanın.

## Releasing

The first public release must be created by an npm owner because the package does not exist yet. After that release, configure an npm trusted publisher for GitHub repository `FatihX1X/Arcanum`, workflow `sdk-release.yml`, and environment `npm`. Pushing a tag that exactly matches the package version, such as `sdk-v0.1.0`, runs all SDK checks and publishes with npm provenance.

## Security model

- The SDK never accepts or stores wallet private keys.
- Contract writes require a connected wallet account, enforce Arc mainnet, and simulate before submission.
- Natural-language private content is encrypted locally. Public contract fields, payments, membership, roles, hashes, and transaction metadata remain on-chain.
- Applications must offer key backup and recovery. Losing the local encryption key makes earlier ciphertext unrecoverable.

MIT
