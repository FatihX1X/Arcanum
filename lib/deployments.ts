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

export const arcMainnetDeployments = {
  chainId: 5042,
  messenger: {
    address: '0xC0043A981650ed85ae89f1c2f60E826D39aC365e',
    blockNumber: 21380701,
  },
  agents: {
    address: '0x2AB26Cf3216852c89BcEea8AAd16e2b96E628108',
    blockNumber: 21380704,
  },
  groups: {
    address: '0x6bB716DB0bce5aFA206C93246d8764D17CE456aD',
    blockNumber: 21380706,
  },
  bulkSender: {
    address: '0xD0aFc0209547986D777CA345aE7ee5F8fcd741D7',
    blockNumber: 21380709,
  },
  gigBoard: {
    address: '0xE238054755B41cA6bDe7C848F9b3e92BCEE22b4A',
    blockNumber: 21380711,
  },
  escrow: {
    address: '0xf9DD777185da559aDadbf298092DE7e6A050a93E',
    blockNumber: 21380714,
  },
} as const;

export const arcDeployments = arcMainnetDeployments;
