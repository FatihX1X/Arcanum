import { PRIVATE_MESSAGE_FEE, PUBLIC_MESSAGE_FEE, arcanumContracts } from 'arcanum-chat-sdk/contracts';

export const arcanumAgentsAddress = arcanumContracts.agents.address;
export const arcanumAgentsAbi = arcanumContracts.agents.abi;
export const isArcanumAgentsConfigured = true;
export const publicAgentMessageFee = PUBLIC_MESSAGE_FEE;
export const privateAgentMessageFee = PRIVATE_MESSAGE_FEE;
export const agentMessageFeeLabel = { public: '0.01 USDC', private: '0.05 USDC' } as const;
export type { Agent, AgentMessage } from 'arcanum-chat-sdk';
