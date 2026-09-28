import type {
  Abi,
  Account,
  Address,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  Hash,
  PublicClient,
  WalletClient,
} from 'viem';
import {
  ARC_MAINNET_CHAIN_ID,
  agentsAbi,
  arcanumContracts,
  bulkSenderAbi,
  escrowAbi,
  gigBoardAbi,
  groupsAbi,
  messengerAbi,
} from './generated/contracts';
import { ArcanumValidationError, WalletClientRequiredError, WrongChainError } from './errors';
import { expectedStaticValue, validateRead, validateWrite } from './validation';

type ReadName<TAbi extends Abi> = ContractFunctionName<TAbi, 'pure' | 'view'>;
type WriteName<TAbi extends Abi> = ContractFunctionName<TAbi, 'nonpayable' | 'payable'>;

export type ContractWriteOptions = {
  account?: Account | Address;
  value?: bigint;
};

export type ArcanumContractClient<TAbi extends Abi> = {
  readonly address: Address;
  readonly abi: TAbi;
  read<TName extends ReadName<TAbi>>(
    functionName: TName,
    args: ContractFunctionArgs<TAbi, 'pure' | 'view', TName>,
  ): Promise<ContractFunctionReturnType<TAbi, 'pure' | 'view', TName>>;
  write<TName extends WriteName<TAbi>>(
    functionName: TName,
    args: ContractFunctionArgs<TAbi, 'nonpayable' | 'payable', TName>,
    options?: ContractWriteOptions,
  ): Promise<Hash>;
};

export type CreateArcanumSdkOptions = {
  publicClient: PublicClient;
  walletClient?: WalletClient;
};

type ContractKey = keyof typeof arcanumContracts;

async function assertMainnet(client: Pick<PublicClient, 'getChainId'> | Pick<WalletClient, 'getChainId'>) {
  const chainId = await client.getChainId();
  if (chainId !== ARC_MAINNET_CHAIN_ID) throw new WrongChainError(chainId, ARC_MAINNET_CHAIN_ID);
}

function walletAccount(walletClient: WalletClient | undefined, override?: Account | Address) {
  const account = override ?? walletClient?.account;
  if (!walletClient || !account) throw new WalletClientRequiredError();
  return { walletClient, account };
}

async function resolveValue(
  contract: ContractKey,
  functionName: string,
  args: readonly unknown[],
  requestedValue: bigint | undefined,
  publicClient: PublicClient,
) {
  let expected = expectedStaticValue(contract, functionName, args);

  if (contract === 'escrow' && functionName === 'fundProposal') {
    const proposal = await publicClient.readContract({
      ...arcanumContracts.gigBoard,
      functionName: 'getFundableProposal',
      args: [args[0] as bigint],
    });
    if (!proposal[7]) throw new ArcanumValidationError('The proposal is not fundable.');
    expected = proposal[3];
  }

  if (expected !== undefined && requestedValue !== undefined && requestedValue !== expected) {
    throw new ArcanumValidationError(`Transaction value must equal ${expected} wei.`);
  }
  return expected ?? requestedValue;
}

function createContractClient<TAbi extends Abi>(
  key: ContractKey,
  abi: TAbi,
  publicClient: PublicClient,
  walletClient?: WalletClient,
): ArcanumContractClient<TAbi> {
  const address = arcanumContracts[key].address;

  return {
    address,
    abi,
    async read(functionName, args) {
      await assertMainnet(publicClient);
      validateRead(String(functionName), args as readonly unknown[]);
      return publicClient.readContract({ address, abi, functionName, args } as never) as Promise<ContractFunctionReturnType<TAbi, 'pure' | 'view', typeof functionName>>;
    },
    async write(functionName, args, options = {}) {
      await assertMainnet(publicClient);
      const selected = walletAccount(walletClient, options.account);
      await assertMainnet(selected.walletClient);
      validateWrite(key, String(functionName), args as readonly unknown[]);
      const value = await resolveValue(key, String(functionName), args as readonly unknown[], options.value, publicClient);
      const simulation = await publicClient.simulateContract({
        address,
        abi,
        functionName,
        args,
        account: selected.account,
        value,
      } as never);
      return selected.walletClient.writeContract(simulation.request as never);
    },
  };
}

export function createArcanumSdk({ publicClient, walletClient }: CreateArcanumSdkOptions) {
  return {
    chainId: ARC_MAINNET_CHAIN_ID,
    contracts: arcanumContracts,
    messenger: createContractClient('messenger', messengerAbi, publicClient, walletClient),
    agents: createContractClient('agents', agentsAbi, publicClient, walletClient),
    groups: createContractClient('groups', groupsAbi, publicClient, walletClient),
    bulkSender: createContractClient('bulkSender', bulkSenderAbi, publicClient, walletClient),
    gigBoard: createContractClient('gigBoard', gigBoardAbi, publicClient, walletClient),
    escrow: createContractClient('escrow', escrowAbi, publicClient, walletClient),
    waitForTransaction(hash: Hash) {
      return publicClient.waitForTransactionReceipt({ hash });
    },
  } as const;
}

export type ArcanumSdk = ReturnType<typeof createArcanumSdk>;
