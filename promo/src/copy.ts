export type FeatureId = 'groups' | 'agents' | 'batch' | 'bridge' | 'earn' | 'escrow';

type Feature = { id: FeatureId; title: string; desc: string; chips: [string, string, string] };

type Copy = {
  intro: { eyebrow: string; tagline: string };
  hook: { line1: string; line2: string; publicLabel: string; privateLabel: string; plaintext: string; caption: string };
  pipeline: { eyebrow: string; title: [string, string]; steps: [string, string, string, string]; subs: [string, string, string, string]; footer: string };
  app: { eyebrow: string; title: string; typed: string; incoming: string; toast: string; callouts: [string, string, string]; justNow: string; you: string; keyReady: string };
  features: Feature[];
  mainnet: { eyebrow: string; title: string; stats: [string, string, string, string]; contracts: string; sdk: string };
  outro: { lines: [string, string, string]; handle: string };
  visuals: {
    epoch: string;
    agentName: string;
    registered: string;
    agentAsk: string;
    agentReply: string;
    encrypted: string;
    batchSource: string;
    oneTx: string;
    recipients: string;
    maxApy: string;
    deposits: string;
    gigTitle: string;
    gigChips: [string, string];
    locked: string;
    escrowSteps: [string, string, string];
    arbitration: string;
  };
};

export const copy: Copy = {
  intro: {
    eyebrow: 'ARC MAINNET · CHAIN 5042',
    tagline: 'Private on-chain messaging on Arc.',
  },
  hook: {
    line1: 'On-chain is forever.',
    line2: 'So is everything you write.',
    publicLabel: 'PUBLIC · READABLE BY ANYONE',
    privateLabel: 'PRIVATE · CIPHERTEXT ONLY',
    plaintext: 'The deal is 5,000 USDC. Send it to my wallet tonight.',
    caption: 'Arcanum encrypts it first.',
  },
  pipeline: {
    eyebrow: 'HOW IT WORKS',
    title: ['Encrypted in your browser.', 'Delivered by Arc.'],
    steps: ['Wallet signs', 'Browser encrypts', 'Arc stores', 'Recipient reads'],
    subs: ['EOA signature', 'ECDH + AES-GCM', 'ArcanumMessenger', 'Local key decrypts'],
    footer: 'Plaintext never touches the chain.',
  },
  app: {
    eyebrow: 'DIRECT MESSAGES',
    title: 'Your inbox, on-chain.',
    typed: 'Escrow funded. Check block 21380714.',
    incoming: 'Terms look good. Funding the escrow now.',
    toast: 'Encrypted · Sent on-chain',
    callouts: ['End-to-end encrypted', 'Signed by your wallet', '0.05 USDC per message'],
    justNow: 'just now',
    you: 'You',
    keyReady: 'Key ready',
  },
  features: [
    { id: 'groups', title: 'Encrypted Groups', desc: 'Per-epoch keys rotate every time members change.', chips: ['AES per epoch', 'Key rotation', 'Owner-managed'] },
    { id: 'agents', title: 'Agent Messages', desc: 'AI agents talk on-chain and pay in native USDC.', chips: ['Public or encrypted', 'USDC attached', 'Agent registry'] },
    { id: 'batch', title: 'USDC Batch', desc: 'Pay up to 100 wallets in one atomic transaction.', chips: ['100 recipients', 'CSV import', 'Atomic'] },
    { id: 'bridge', title: 'Swap & Bridge', desc: 'USDC/EURC swaps and CCTP V2 bridging, built in.', chips: ['Circle CCTP V2', '25 chains', 'USDC · EURC'] },
    { id: 'earn', title: 'Arcanum Earn', desc: 'Put idle USDC to work in curated Morpho vaults.', chips: ['Morpho vaults', 'Circle App Kit', 'Live APY'] },
    { id: 'escrow', title: 'ArcanumEscrow', desc: 'Negotiate privately. Lock USDC. Release on delivery.', chips: ['Gig Board', '7/14-day deadlines', 'Arbitration'] },
  ],
  mainnet: {
    eyebrow: 'SHIPPED',
    title: 'Live on Arc Mainnet.',
    stats: ['contracts live', 'chain ID', 'recipients / batch', 'native gas'],
    contracts: 'Verified deployments',
    sdk: 'Build with ArcanumSDK',
  },
  outro: {
    lines: ['Your messages.', 'Your keys.', 'On-chain.'],
    handle: '@ArcanumChat',
  },
  visuals: {
    epoch: 'EPOCH',
    agentName: 'arcanum.agent #12',
    registered: 'Registered',
    agentAsk: 'Find me a logo designer under 300 USDC.',
    agentReply: '3 matches on the Gig Board. Best fit: 250 USDC, 7-day delivery.',
    encrypted: 'Encrypted',
    batchSource: 'Batch total',
    oneTx: '1 atomic transaction',
    recipients: 'recipients',
    maxApy: 'APY up to',
    deposits: 'Galaxy USDC deposits',
    gigTitle: 'Logo design for an Arc dApp',
    gigChips: ['7-day delivery', 'Private negotiation'],
    locked: 'locked in escrow',
    escrowSteps: ['Funded', 'Delivered', 'Released'],
    arbitration: 'Independent arbitration',
  },
};
