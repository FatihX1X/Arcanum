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
] as const;
