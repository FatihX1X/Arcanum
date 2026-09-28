import { describe, expect, it, vi } from 'vitest';
import { createArcanumSdk } from '../src/client';
import { arcanumContracts } from '../src/generated/contracts';
import { ArcanumValidationError, WrongChainError } from '../src/errors';
import { PUBLIC_MESSAGE_FEE } from '../src/validation';

const account = '0x1111111111111111111111111111111111111111' as const;
const recipient = '0x2222222222222222222222222222222222222222' as const;

function clients(chainId = 5042) {
  const publicClient = {
    getChainId: vi.fn(async () => chainId),
    readContract: vi.fn(async () => 7n),
    simulateContract: vi.fn(async (request) => ({ request: { ...request, chain: null } })),
    waitForTransactionReceipt: vi.fn(async ({ hash }) => ({ transactionHash: hash, status: 'success' })),
  };
  const walletClient = {
    account,
    getChainId: vi.fn(async () => chainId),
    writeContract: vi.fn(async () => `0x${'ab'.repeat(32)}`),
  };
  return { publicClient, walletClient };
}

describe('createArcanumSdk', () => {
  it('exposes all six mainnet contract descriptors', () => {
    expect(Object.keys(arcanumContracts)).toEqual(['messenger', 'agents', 'groups', 'bulkSender', 'gigBoard', 'escrow']);
    expect(arcanumContracts.messenger.address).toBe('0xC0043A981650ed85ae89f1c2f60E826D39aC365e');
  });

  it('rejects reads on a non-mainnet client before touching the contract', async () => {
    const { publicClient } = clients(1);
    const sdk = createArcanumSdk({ publicClient: publicClient as never });
    await expect(sdk.messenger.read('messageCount', [])).rejects.toBeInstanceOf(WrongChainError);
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it('rejects oversized pages locally', async () => {
    const { publicClient } = clients();
    const sdk = createArcanumSdk({ publicClient: publicClient as never });
    await expect(sdk.messenger.read('getInboxPage', [account, 0n, 101n])).rejects.toBeInstanceOf(ArcanumValidationError);
  });

  it('simulates writes and supplies the exact public-message fee', async () => {
    const { publicClient, walletClient } = clients();
    const sdk = createArcanumSdk({ publicClient: publicClient as never, walletClient: walletClient as never });
    const hash = await sdk.messenger.write('sendMessage', [recipient, 'hello', false]);
    expect(hash).toMatch(/^0x/);
    expect(publicClient.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ value: PUBLIC_MESSAGE_FEE }));
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
  });

  it('validates batch amounts before simulation', async () => {
    const { publicClient, walletClient } = clients();
    const sdk = createArcanumSdk({ publicClient: publicClient as never, walletClient: walletClient as never });
    await expect(sdk.bulkSender.write('batchSend', [[recipient], [0n]])).rejects.toBeInstanceOf(ArcanumValidationError);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('propagates contract simulation errors without submitting', async () => {
    const { publicClient, walletClient } = clients();
    publicClient.simulateContract.mockRejectedValueOnce(new Error('execution reverted: CANNOT_MESSAGE_SELF'));
    const sdk = createArcanumSdk({ publicClient: publicClient as never, walletClient: walletClient as never });
    await expect(sdk.messenger.write('sendMessage', [recipient, 'hello', false])).rejects.toThrow('CANNOT_MESSAGE_SELF');
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('reads the accepted proposal amount before escrow funding', async () => {
    const { publicClient, walletClient } = clients();
    publicClient.readContract.mockResolvedValueOnce([account, recipient, '0x3333333333333333333333333333333333333333', 55n, 7, `0x${'11'.repeat(32)}`, 1n, true] as never);
    const sdk = createArcanumSdk({ publicClient: publicClient as never, walletClient: walletClient as never });
    await sdk.escrow.write('fundProposal', [2n]);
    expect(publicClient.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ value: 55n }));
  });
});
