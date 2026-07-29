import { arcTestnetDeployments, zeroAddress } from './deployments';

export const arcanumBulkSenderAddress = (
  process.env.NEXT_PUBLIC_BULK_CONTRACT_ADDRESS || arcTestnetDeployments.bulkSender.address
) as `0x${string}`;

export const isArcanumBulkSenderConfigured = arcanumBulkSenderAddress !== zeroAddress;

export const arcanumBulkSenderAbi = [
  { type: 'function', name: 'MAX_RECIPIENTS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'batchCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'batchSend',
    stateMutability: 'payable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'BatchSent',
    inputs: [
      { name: 'batchId', type: 'uint256', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'recipientCount', type: 'uint256', indexed: false },
      { name: 'totalAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TransferSent',
    inputs: [
      { name: 'batchId', type: 'uint256', indexed: true },
      { name: 'index', type: 'uint256', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
