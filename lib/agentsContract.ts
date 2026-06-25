import { parseEther } from 'viem';

export const arcanumAgentsAddress = (
  process.env.NEXT_PUBLIC_AGENT_CONTRACT_ADDRESS || '0x357096A24F914A178F04B7175837a2f969C42eCA'
) as `0x${string}`;

export const isArcanumAgentsConfigured =
  arcanumAgentsAddress !== '0x0000000000000000000000000000000000000000';

export const publicAgentMessageFee = parseEther('0.01');
export const privateAgentMessageFee = parseEther('0.05');
export const agentMessageFeeLabel = {
  public: '0.01 USDC',
  private: '0.05 USDC',
} as const;

const agentMessageTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'sender', type: 'address' },
  { name: 'recipient', type: 'address' },
  { name: 'payload', type: 'string' },
  { name: 'isPrivate', type: 'bool' },
  { name: 'paymentAmount', type: 'uint256' },
  { name: 'timestamp', type: 'uint256' },
] as const;

const agentTuple = [
  { name: 'agentAddress', type: 'address' },
  { name: 'name', type: 'string' },
  { name: 'description', type: 'string' },
  { name: 'metadataURI', type: 'string' },
  { name: 'registeredAt', type: 'uint256' },
  { name: 'isActive', type: 'bool' },
] as const;

export const arcanumAgentsAbi = [
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
    name: 'registerAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setAgentActive',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'isActive', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getAgent',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'tuple', components: agentTuple }],
  },
  {
    type: 'function',
    name: 'isActiveAgent',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
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
    name: 'sendAgentMessage',
    stateMutability: 'payable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'payload', type: 'string' },
      { name: 'isPrivate', type: 'bool' },
      { name: 'paymentAmount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getInbox',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'tuple[]', components: agentMessageTuple }],
  },
  {
    type: 'function',
    name: 'getOutbox',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'tuple[]', components: agentMessageTuple }],
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
    name: 'claim_fees',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

export type Agent = {
  agentAddress: `0x${string}`;
  name: string;
  description: string;
  metadataURI: string;
  registeredAt: bigint;
  isActive: boolean;
};

export type AgentMessage = {
  id: bigint;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  payload: string;
  isPrivate: boolean;
  paymentAmount: bigint;
  timestamp: bigint;
};
