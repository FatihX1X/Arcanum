export class ArcanumSdkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class WrongChainError extends ArcanumSdkError {
  readonly expectedChainId: number;
  readonly actualChainId: number;

  constructor(actualChainId: number, expectedChainId: number) {
    super(`Arcanum supports Arc mainnet (${expectedChainId}); connected chain is ${actualChainId}.`);
    this.actualChainId = actualChainId;
    this.expectedChainId = expectedChainId;
  }
}

export class WalletClientRequiredError extends ArcanumSdkError {
  constructor() {
    super('A wallet client with an account is required for contract writes.');
  }
}

export class ArcanumValidationError extends ArcanumSdkError {}
