import { parseEther, zeroAddress } from 'viem';

export const arcanumBulkAddress = (
  process.env.NEXT_PUBLIC_BULK_CONTRACT_ADDRESS || zeroAddress
) as `0x${string}`;
export const arcUsdcAddress = (
  process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000'
) as `0x${string}`;

export const isArcanumBulkConfigured = arcanumBulkAddress !== zeroAddress;
export const bulkBatchFee = parseEther('0.05');
export const bulkBatchFeeLabel = '0.05 USDC';
export const maxBulkRecipients = 100;

const bulkBatchTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'sender', type: 'address' },
  { name: 'totalAmount', type: 'uint256' },
  { name: 'recipientCount', type: 'uint256' },
  { name: 'message', type: 'string' },
  { name: 'timestamp', type: 'uint256' },
] as const;

const bulkTransferTuple = [
  { name: 'recipient', type: 'address' },
  { name: 'amount', type: 'uint256' },
] as const;

export const arcanumBulkAbi = [
  { type: 'function', name: 'BULK_BATCH_FEE', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'batchCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'bulkSend',
    stateMutability: 'payable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'message', type: 'string' },
    ],
    outputs: [{ name: 'batchId', type: 'uint256' }],
  },
  { type: 'function', name: 'getBatch', stateMutability: 'view', inputs: [{ name: 'batchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: bulkBatchTuple }] },
  {
    type: 'function',
    name: 'getBatchTransfersPage',
    stateMutability: 'view',
    inputs: [{ name: 'batchId', type: 'uint256' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple[]', components: bulkTransferTuple }],
  },
  {
    type: 'function',
    name: 'getSentBatchIdsPage',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'getReceivedBatchIdsPage',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const;

export const arcUsdcAbi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export type BulkBatch = {
  id: bigint;
  sender: `0x${string}`;
  totalAmount: bigint;
  recipientCount: bigint;
  message: string;
  timestamp: bigint;
};

export type BulkTransfer = {
  recipient: `0x${string}`;
  amount: bigint;
};
