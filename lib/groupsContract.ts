import { GROUP_MESSAGE_FEE, arcanumContracts } from 'arcanum-chat-sdk/contracts';

export const arcanumGroupsAddress = arcanumContracts.groups.address;
export const arcanumGroupsAbi = arcanumContracts.groups.abi;
export const isArcanumGroupsConfigured = true;
export const groupMessageFee = GROUP_MESSAGE_FEE;
export const groupMessageFeeLabel = '0.05 USDC';
export type { GroupMessageRecord, GroupRecord } from 'arcanum-chat-sdk';
