export const arcanumMessengerAddress = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xC5E634BBA75bB25758E15247E7C07Da889301584'
) as `0x${string}`;

export const isArcanumMessengerConfigured =
  arcanumMessengerAddress !== '0x0000000000000000000000000000000000000000';

export const arcanumMessengerAbi = [
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
    stateMutability: 'nonpayable',
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
] as const;

export type ChainMessage = {
  id: bigint;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  payload: string;
  isPrivate: boolean;
  timestamp: bigint;
};
