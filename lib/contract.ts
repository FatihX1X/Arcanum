import { PRIVATE_MESSAGE_FEE, PUBLIC_MESSAGE_FEE, arcanumContracts } from 'arcanum-chat-sdk/contracts';

export const arcanumMessengerAddress = arcanumContracts.messenger.address;
export const arcanumMessengerAbi = arcanumContracts.messenger.abi;
export const isArcanumMessengerConfigured = true;
export const publicMessageFee = PUBLIC_MESSAGE_FEE;
export const privateMessageFee = PRIVATE_MESSAGE_FEE;
export const messageFeeLabel = { public: '0.01 USDC', private: '0.05 USDC' } as const;
export type { ChainMessage } from 'arcanum-chat-sdk';
