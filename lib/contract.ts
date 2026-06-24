import { parseEther } from 'viem';

export const arcanumMessengerAddress = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x5b713DB5623d640a2E6c6eA0f002F229191E5DBB'
) as `0x${string}`;

export const isArcanumMessengerConfigured =
  arcanumMessengerAddress !== '0x0000000000000000000000000000000000000000';

export const publicMessageFee = parseEther('0.01');
export const privateMessageFee = parseEther('0.05');
export const messageFeeLabel = {
  public: '0.01 USDC',
  private: '0.05 USDC',
} as const;

export const arcanumMessengerAbi = [
  {
    type: 'function',
    name: 'PRIVATE_MESSAGE_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'PUBLIC_MESSAGE_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MAX_PAYLOAD_BYTES',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MAX_PAGE_SIZE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'FEE_CLAIM_WALLET',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'feeClaimWhitelist',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'registerEncryptionKey',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'publicKey', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'sendMessage',
    stateMutability: 'payable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'payload', type: 'string' },
      { name: 'isPrivate', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getInbox',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'sender', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'payload', type: 'string' },
          { name: 'isPrivate', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getOutbox',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'sender', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'payload', type: 'string' },
          { name: 'isPrivate', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'encryptionKeys',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'getInboxPage',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'sender', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'payload', type: 'string' },
          { name: 'isPrivate', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getOutboxPage',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'sender', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'payload', type: 'string' },
          { name: 'isPrivate', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getInboxCount',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getOutboxCount',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim_fees',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

export type ChainMessage = {
  id: bigint;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  payload: string;
  isPrivate: boolean;
  timestamp: bigint;
};
