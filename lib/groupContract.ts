import { parseEther, zeroAddress, type Hex } from 'viem';

export const arcanumGroupAddress = (
  process.env.NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS || zeroAddress
) as `0x${string}`;

export const isArcanumGroupConfigured = arcanumGroupAddress !== zeroAddress;
export const groupMessageFee = parseEther('0.05');
export const groupMessageFeeLabel = '0.05 USDC';
export const maxGroupMembers = 20;
export const maxGroupPlaintextBytes = 2048;

const groupTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'name', type: 'string' },
  { name: 'owner', type: 'address' },
  { name: 'createdAt', type: 'uint256' },
  { name: 'membershipVersion', type: 'uint256' },
  { name: 'memberCount', type: 'uint256' },
  { name: 'pendingInviteCount', type: 'uint256' },
] as const;

const groupMessageTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'groupId', type: 'uint256' },
  { name: 'sender', type: 'address' },
  { name: 'ciphertext', type: 'bytes' },
  { name: 'cryptoMeta', type: 'bytes' },
  { name: 'wrappedKey', type: 'bytes' },
  { name: 'membershipVersion', type: 'uint256' },
  { name: 'timestamp', type: 'uint256' },
] as const;

export const arcanumGroupAbi = [
  { type: 'function', name: 'GROUP_MESSAGE_FEE', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'groupCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'messageCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'createGroup',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: 'groupId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'renameGroup',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'name', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'inviteMember',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'invitee', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelInvite',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'invitee', type: 'address' }],
    outputs: [],
  },
  { type: 'function', name: 'acceptInvite', stateMutability: 'nonpayable', inputs: [{ name: 'groupId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'declineInvite', stateMutability: 'nonpayable', inputs: [{ name: 'groupId', type: 'uint256' }], outputs: [] },
  {
    type: 'function',
    name: 'removeMember',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'member', type: 'address' }],
    outputs: [],
  },
  { type: 'function', name: 'leaveGroup', stateMutability: 'nonpayable', inputs: [{ name: 'groupId', type: 'uint256' }], outputs: [] },
  {
    type: 'function',
    name: 'setAdmin',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'member', type: 'address' }, { name: 'enabled', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'newOwner', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'sendGroupMessage',
    stateMutability: 'payable',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'expectedMembershipVersion', type: 'uint256' },
      { name: 'ciphertext', type: 'bytes' },
      { name: 'cryptoMeta', type: 'bytes' },
      { name: 'wrappedKeys', type: 'bytes[]' },
    ],
    outputs: [{ name: 'messageId', type: 'uint256' }],
  },
  { type: 'function', name: 'getGroup', stateMutability: 'view', inputs: [{ name: 'groupId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: groupTuple }] },
  { type: 'function', name: 'getMembers', stateMutability: 'view', inputs: [{ name: 'groupId', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }] },
  {
    type: 'function',
    name: 'isMember',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isAdmin',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }, { name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getAccountGroupIdsPage',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'getPendingGroupIdsPage',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  { type: 'function', name: 'getGroupMessageCount', stateMutability: 'view', inputs: [{ name: 'groupId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'getGroupMessagesPageFor',
    stateMutability: 'view',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'account', type: 'address' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'tuple[]', components: groupMessageTuple }],
  },
] as const;

export type GroupSummary = {
  id: bigint;
  name: string;
  owner: `0x${string}`;
  createdAt: bigint;
  membershipVersion: bigint;
  memberCount: bigint;
  pendingInviteCount: bigint;
};

export type GroupMessageView = {
  id: bigint;
  groupId: bigint;
  sender: `0x${string}`;
  ciphertext: Hex;
  cryptoMeta: Hex;
  wrappedKey: Hex;
  membershipVersion: bigint;
  timestamp: bigint;
};
