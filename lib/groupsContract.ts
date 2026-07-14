import { parseEther } from 'viem';
import { arcTestnetDeployments, zeroAddress } from './deployments';

export const arcanumGroupsAddress = (
  process.env.NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS || arcTestnetDeployments.groups.address
) as `0x${string}`;

export const isArcanumGroupsConfigured = arcanumGroupsAddress !== zeroAddress;
export const groupMessageFee = parseEther('0.05');
export const groupMessageFeeLabel = '0.05 USDC';

export const arcanumGroupsAbi = [
  { type: 'function', name: 'GROUP_MESSAGE_FEE', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'MAX_MEMBERS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'KEY_REGISTRY', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  {
    type: 'function',
    name: 'createGroup',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'groupId', type: 'bytes32' },
      { name: 'members', type: 'address[]' },
      { name: 'encryptedMetadata', type: 'string' },
      { name: 'envelopes', type: 'string[]' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'updateMembers',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'groupId', type: 'bytes32' },
      { name: 'members', type: 'address[]' },
      { name: 'encryptedMetadata', type: 'string' },
      { name: 'envelopes', type: 'string[]' },
    ],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'sendGroupMessage',
    stateMutability: 'payable',
    inputs: [
      { name: 'groupId', type: 'bytes32' },
      { name: 'epoch', type: 'uint64' },
      { name: 'payload', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getGroup',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'bytes32' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'id', type: 'bytes32' },
        { name: 'owner', type: 'address' },
        { name: 'currentEpoch', type: 'uint64' },
        { name: 'createdAt', type: 'uint64' },
        { name: 'encryptedMetadata', type: 'string' },
      ],
    }],
  },
  { type: 'function', name: 'getMembers', stateMutability: 'view', inputs: [{ name: 'groupId', type: 'bytes32' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'isCurrentMember', stateMutability: 'view', inputs: [{ name: 'groupId', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'getGroupsFor', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'bytes32[]' }] },
  { type: 'function', name: 'getKeyEnvelope', stateMutability: 'view', inputs: [{ name: 'groupId', type: 'bytes32' }, { name: 'epoch', type: 'uint64' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'messageCount', stateMutability: 'view', inputs: [{ name: 'groupId', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'getMessagesPage',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'bytes32' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple[]',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'groupId', type: 'bytes32' },
        { name: 'epoch', type: 'uint64' },
        { name: 'sender', type: 'address' },
        { name: 'payload', type: 'string' },
        { name: 'timestamp', type: 'uint64' },
      ],
    }],
  },
] as const;

export type GroupRecord = {
  id: `0x${string}`;
  owner: `0x${string}`;
  currentEpoch: bigint;
  createdAt: bigint;
  encryptedMetadata: string;
};

export type GroupMessageRecord = {
  id: bigint;
  groupId: `0x${string}`;
  epoch: bigint;
  sender: `0x${string}`;
  payload: string;
  timestamp: bigint;
};
