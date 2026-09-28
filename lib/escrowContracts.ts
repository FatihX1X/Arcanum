import { arcanumContracts } from 'arcanum-chat-sdk/contracts';

export const arcanumGigBoardAddress = arcanumContracts.gigBoard.address;
export const arcanumGigBoardAbi = arcanumContracts.gigBoard.abi;
export const arcanumEscrowAddress = arcanumContracts.escrow.address;
export const arcanumEscrowAbi = arcanumContracts.escrow.abi;
export const isArcanumGigBoardConfigured = true;
export const isArcanumEscrowConfigured = true;
export const isArcanumEscrowSuiteConfigured = true;
export type { EscrowChatMessage, EscrowConversation, EscrowEvidence, EscrowProposal, EscrowRecord, EscrowStatus, GigCategory, GigRecord, GigStatus, ListingType, ProposalStatus } from 'arcanum-chat-sdk';
