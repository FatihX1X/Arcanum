import { arcTestnetDeployments, zeroAddress } from './deployments';

export const arcanumGigBoardAddress = (
  process.env.NEXT_PUBLIC_GIG_BOARD_CONTRACT_ADDRESS || arcTestnetDeployments.gigBoard.address
) as `0x${string}`;

export const arcanumEscrowAddress = (
  process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS || arcTestnetDeployments.escrow.address
) as `0x${string}`;

export const isArcanumGigBoardConfigured = arcanumGigBoardAddress !== zeroAddress;
export const isArcanumEscrowConfigured = arcanumEscrowAddress !== zeroAddress;
export const isArcanumEscrowSuiteConfigured = isArcanumGigBoardConfigured && isArcanumEscrowConfigured;

const gigTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'creator', type: 'address' },
  { name: 'listingType', type: 'uint8' },
  { name: 'category', type: 'uint8' },
  { name: 'title', type: 'string' },
  { name: 'description', type: 'string' },
  { name: 'suggestedBudget', type: 'uint256' },
  { name: 'createdAt', type: 'uint64' },
  { name: 'status', type: 'uint8' },
  { name: 'awardedEscrowId', type: 'uint256' },
] as const;

const conversationTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'gigId', type: 'uint256' },
  { name: 'creator', type: 'address' },
  { name: 'counterparty', type: 'address' },
  { name: 'createdAt', type: 'uint64' },
  { name: 'messageCount', type: 'uint256' },
  { name: 'activeProposalId', type: 'uint256' },
  { name: 'hasActiveProposal', type: 'bool' },
] as const;

const messageTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'conversationId', type: 'uint256' },
  { name: 'sender', type: 'address' },
  { name: 'payload', type: 'string' },
  { name: 'kind', type: 'uint8' },
  { name: 'proposalId', type: 'uint256' },
  { name: 'timestamp', type: 'uint64' },
] as const;

const proposalTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'conversationId', type: 'uint256' },
  { name: 'proposer', type: 'address' },
  { name: 'payer', type: 'address' },
  { name: 'provider', type: 'address' },
  { name: 'arbiter', type: 'address' },
  { name: 'amount', type: 'uint256' },
  { name: 'timeoutDays', type: 'uint8' },
  { name: 'termsHash', type: 'bytes32' },
  { name: 'createdAt', type: 'uint64' },
  { name: 'status', type: 'uint8' },
  { name: 'escrowId', type: 'uint256' },
] as const;

const escrowTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'gigId', type: 'uint256' },
  { name: 'proposalId', type: 'uint256' },
  { name: 'payer', type: 'address' },
  { name: 'provider', type: 'address' },
  { name: 'arbiter', type: 'address' },
  { name: 'amount', type: 'uint256' },
  { name: 'createdAt', type: 'uint64' },
  { name: 'deadline', type: 'uint64' },
  { name: 'termsHash', type: 'bytes32' },
  { name: 'status', type: 'uint8' },
  { name: 'resolutionHash', type: 'bytes32' },
  { name: 'resolutionURI', type: 'string' },
] as const;

const evidenceTuple = [
  { name: 'id', type: 'uint256' },
  { name: 'author', type: 'address' },
  { name: 'evidenceHash', type: 'bytes32' },
  { name: 'evidenceURI', type: 'string' },
  { name: 'timestamp', type: 'uint64' },
] as const;

export const arcanumGigBoardAbi = [
  { type: 'function', name: 'createGig', stateMutability: 'nonpayable', inputs: [{ name: 'listingType', type: 'uint8' }, { name: 'category', type: 'uint8' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'suggestedBudget', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'cancelGig', stateMutability: 'nonpayable', inputs: [{ name: 'gigId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'startConversation', stateMutability: 'nonpayable', inputs: [{ name: 'gigId', type: 'uint256' }, { name: 'encryptedInitialMessage', type: 'string' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'sendMessage', stateMutability: 'nonpayable', inputs: [{ name: 'conversationId', type: 'uint256' }, { name: 'encryptedPayload', type: 'string' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'proposeTerms', stateMutability: 'nonpayable', inputs: [{ name: 'conversationId', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'timeoutDays', type: 'uint8' }, { name: 'arbiter', type: 'address' }, { name: 'termsHash', type: 'bytes32' }, { name: 'encryptedNote', type: 'string' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'acceptProposal', stateMutability: 'nonpayable', inputs: [{ name: 'proposalId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdrawProposal', stateMutability: 'nonpayable', inputs: [{ name: 'proposalId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'getGigsPage', stateMutability: 'view', inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'tuple[]', components: gigTuple }] },
  { type: 'function', name: 'getConversationsPage', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'tuple[]', components: conversationTuple }] },
  { type: 'function', name: 'getMessagesPage', stateMutability: 'view', inputs: [{ name: 'conversationId', type: 'uint256' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'tuple[]', components: messageTuple }] },
  { type: 'function', name: 'getProposalsPage', stateMutability: 'view', inputs: [{ name: 'conversationId', type: 'uint256' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'tuple[]', components: proposalTuple }] },
  { type: 'function', name: 'getConversationId', stateMutability: 'view', inputs: [{ name: 'gigId', type: 'uint256' }, { name: 'counterparty', type: 'address' }], outputs: [{ name: 'exists', type: 'bool' }, { name: 'conversationId', type: 'uint256' }] },
  { type: 'event', name: 'GigCreated', inputs: [{ name: 'gigId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'listingType', type: 'uint8', indexed: true }, { name: 'category', type: 'uint8', indexed: false }, { name: 'suggestedBudget', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'ConversationStarted', inputs: [{ name: 'conversationId', type: 'uint256', indexed: true }, { name: 'gigId', type: 'uint256', indexed: true }, { name: 'counterparty', type: 'address', indexed: true }, { name: 'creator', type: 'address', indexed: false }] },
  { type: 'event', name: 'ChatMessageSent', inputs: [{ name: 'conversationId', type: 'uint256', indexed: true }, { name: 'messageId', type: 'uint256', indexed: true }, { name: 'sender', type: 'address', indexed: true }, { name: 'kind', type: 'uint8', indexed: false }, { name: 'proposalId', type: 'uint256', indexed: false }, { name: 'timestamp', type: 'uint64', indexed: false }] },
  { type: 'event', name: 'ProposalCreated', inputs: [{ name: 'proposalId', type: 'uint256', indexed: true }, { name: 'conversationId', type: 'uint256', indexed: true }, { name: 'proposer', type: 'address', indexed: true }, { name: 'payer', type: 'address', indexed: false }, { name: 'provider', type: 'address', indexed: false }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'timeoutDays', type: 'uint8', indexed: false }, { name: 'arbiter', type: 'address', indexed: false }, { name: 'termsHash', type: 'bytes32', indexed: false }] },
  { type: 'event', name: 'ProposalAccepted', inputs: [{ name: 'proposalId', type: 'uint256', indexed: true }, { name: 'accepter', type: 'address', indexed: true }] },
  { type: 'event', name: 'ProposalWithdrawn', inputs: [{ name: 'proposalId', type: 'uint256', indexed: true }, { name: 'account', type: 'address', indexed: true }] },
  { type: 'event', name: 'GigFunded', inputs: [{ name: 'gigId', type: 'uint256', indexed: true }, { name: 'proposalId', type: 'uint256', indexed: true }, { name: 'escrowId', type: 'uint256', indexed: true }] },
  { type: 'event', name: 'GigClosed', inputs: [{ name: 'gigId', type: 'uint256', indexed: true }, { name: 'escrowId', type: 'uint256', indexed: true }, { name: 'finalEscrowStatus', type: 'uint8', indexed: false }] },
] as const;

export const arcanumEscrowAbi = [
  { type: 'function', name: 'fundProposal', stateMutability: 'payable', inputs: [{ name: 'proposalId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'release', stateMutability: 'nonpayable', inputs: [{ name: 'escrowId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'refund', stateMutability: 'nonpayable', inputs: [{ name: 'escrowId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'openDispute', stateMutability: 'nonpayable', inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'evidenceHash', type: 'bytes32' }, { name: 'evidenceURI', type: 'string' }], outputs: [] },
  { type: 'function', name: 'submitEvidence', stateMutability: 'nonpayable', inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'evidenceHash', type: 'bytes32' }, { name: 'evidenceURI', type: 'string' }], outputs: [] },
  { type: 'function', name: 'resolveDispute', stateMutability: 'nonpayable', inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'releaseToProvider', type: 'bool' }, { name: 'resolutionHash', type: 'bytes32' }, { name: 'resolutionURI', type: 'string' }], outputs: [] },
  { type: 'function', name: 'getEscrowsFor', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'tuple[]', components: escrowTuple }] },
  { type: 'function', name: 'getEvidencePage', stateMutability: 'view', inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'tuple[]', components: evidenceTuple }] },
  { type: 'event', name: 'EscrowLocked', inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }, { name: 'gigId', type: 'uint256', indexed: true }, { name: 'proposalId', type: 'uint256', indexed: true }, { name: 'payer', type: 'address', indexed: false }, { name: 'provider', type: 'address', indexed: false }, { name: 'arbiter', type: 'address', indexed: false }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'deadline', type: 'uint64', indexed: false }, { name: 'termsHash', type: 'bytes32', indexed: false }] },
  { type: 'event', name: 'EscrowReleased', inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }, { name: 'provider', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'EscrowRefunded', inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }, { name: 'payer', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'EscrowDisputed', inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }, { name: 'openedBy', type: 'address', indexed: true }, { name: 'timestamp', type: 'uint64', indexed: false }] },
  { type: 'event', name: 'EvidenceSubmitted', inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }, { name: 'evidenceId', type: 'uint256', indexed: true }, { name: 'author', type: 'address', indexed: true }, { name: 'evidenceHash', type: 'bytes32', indexed: false }, { name: 'evidenceURI', type: 'string', indexed: false }] },
  { type: 'event', name: 'DisputeResolved', inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }, { name: 'arbiter', type: 'address', indexed: true }, { name: 'resolution', type: 'uint8', indexed: false }, { name: 'resolutionHash', type: 'bytes32', indexed: false }, { name: 'resolutionURI', type: 'string', indexed: false }] },
] as const;

export type ListingType = 0 | 1;
export type GigCategory = 0 | 1 | 2 | 3 | 4;
export type GigStatus = 0 | 1 | 2 | 3;
export type ProposalStatus = 0 | 1 | 2 | 3 | 4;
export type EscrowStatus = 0 | 1 | 2 | 3;

export type GigRecord = { id: bigint; creator: `0x${string}`; listingType: ListingType; category: GigCategory; title: string; description: string; suggestedBudget: bigint; createdAt: bigint; status: GigStatus; awardedEscrowId: bigint };
export type EscrowConversation = { id: bigint; gigId: bigint; creator: `0x${string}`; counterparty: `0x${string}`; createdAt: bigint; messageCount: bigint; activeProposalId: bigint; hasActiveProposal: boolean };
export type EscrowChatMessage = { id: bigint; conversationId: bigint; sender: `0x${string}`; payload: string; kind: 0 | 1; proposalId: bigint; timestamp: bigint };
export type EscrowProposal = { id: bigint; conversationId: bigint; proposer: `0x${string}`; payer: `0x${string}`; provider: `0x${string}`; arbiter: `0x${string}`; amount: bigint; timeoutDays: number; termsHash: `0x${string}`; createdAt: bigint; status: ProposalStatus; escrowId: bigint };
export type EscrowRecord = { id: bigint; gigId: bigint; proposalId: bigint; payer: `0x${string}`; provider: `0x${string}`; arbiter: `0x${string}`; amount: bigint; createdAt: bigint; deadline: bigint; termsHash: `0x${string}`; status: EscrowStatus; resolutionHash: `0x${string}`; resolutionURI: string };
export type EscrowEvidence = { id: bigint; author: `0x${string}`; evidenceHash: `0x${string}`; evidenceURI: string; timestamp: bigint };
