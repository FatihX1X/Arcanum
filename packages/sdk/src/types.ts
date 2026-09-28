import type { Address, Hash } from 'viem';

export type ChainMessage = {
  id: bigint;
  sender: Address;
  recipient: Address;
  payload: string;
  isPrivate: boolean;
  timestamp: bigint;
};

export type Agent = {
  agentAddress: Address;
  name: string;
  description: string;
  metadataURI: string;
  registeredAt: bigint;
  isActive: boolean;
};

export type AgentMessage = ChainMessage & { paymentAmount: bigint };
export type GroupRecord = { id: Hash; owner: Address; currentEpoch: bigint; createdAt: bigint; encryptedMetadata: string };
export type GroupMessageRecord = { id: bigint; groupId: Hash; epoch: bigint; sender: Address; payload: string; timestamp: bigint };
export type ListingType = 0 | 1;
export type GigCategory = 0 | 1 | 2 | 3 | 4;
export type GigStatus = 0 | 1 | 2 | 3;
export type ProposalStatus = 0 | 1 | 2 | 3 | 4;
export type EscrowStatus = 0 | 1 | 2 | 3;
export type GigRecord = { id: bigint; creator: Address; listingType: ListingType; category: GigCategory; title: string; description: string; suggestedBudget: bigint; createdAt: bigint; status: GigStatus; awardedEscrowId: bigint };
export type EscrowConversation = { id: bigint; gigId: bigint; creator: Address; counterparty: Address; createdAt: bigint; messageCount: bigint; activeProposalId: bigint; hasActiveProposal: boolean };
export type EscrowChatMessage = { id: bigint; conversationId: bigint; sender: Address; payload: string; kind: 0 | 1; proposalId: bigint; timestamp: bigint };
export type EscrowProposal = { id: bigint; conversationId: bigint; proposer: Address; payer: Address; provider: Address; arbiter: Address; amount: bigint; timeoutDays: number; termsHash: Hash; createdAt: bigint; status: ProposalStatus; escrowId: bigint };
export type EscrowRecord = { id: bigint; gigId: bigint; proposalId: bigint; payer: Address; provider: Address; arbiter: Address; amount: bigint; createdAt: bigint; deadline: bigint; termsHash: Hash; status: EscrowStatus; resolutionHash: Hash; resolutionURI: string };
export type EscrowEvidence = { id: bigint; author: Address; evidenceHash: Hash; evidenceURI: string; timestamp: bigint };
