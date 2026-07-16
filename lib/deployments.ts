export const zeroAddress = '0x0000000000000000000000000000000000000000' as const;

export const arcTestnetDeployments = {
  chainId: 5042002,
  messenger: {
    address: '0x5b713DB5623d640a2E6c6eA0f002F229191E5DBB',
    blockNumber: 0,
  },
  agents: {
    address: '0x357096A24F914A178F04B7175837a2f969C42eCA',
    blockNumber: 0,
  },
  groups: {
    address: '0x7D002a28F7AA463DF79B84F6f05859967caf9c79',
    blockNumber: 51780377,
  },
  bulkSender: {
    address: '0xD1B9D190fC8F86c94E35B7a02Bf8E9d048832Cea',
    blockNumber: 51780401,
  },
  gigBoard: {
    address: '0x595f7d521e30dd8FDD9E0130e778ce1E63e909A0',
    blockNumber: 52109905,
  },
  escrow: {
    address: '0x993d0903f45376c0746572Af69f9577179A2A350',
    blockNumber: 52109913,
  },
} as const;
