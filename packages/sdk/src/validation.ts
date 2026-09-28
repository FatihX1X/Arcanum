import { parseEther, zeroAddress } from 'viem';
import { ArcanumValidationError } from './errors';

export const PUBLIC_MESSAGE_FEE = parseEther('0.01');
export const PRIVATE_MESSAGE_FEE = parseEther('0.05');
export const GROUP_MESSAGE_FEE = parseEther('0.05');
export const MAX_PAGE_SIZE = 100n;
export const MAX_GROUP_MEMBERS = 25;
export const MAX_BULK_RECIPIENTS = 100;
export const MAX_PAYLOAD_BYTES = 4096;
export const MAX_GROUP_ENVELOPE_BYTES = 2048;
export const MAX_GIG_TITLE_BYTES = 120;
export const MAX_GIG_DESCRIPTION_BYTES = 2048;
export const MAX_EVIDENCE_URI_BYTES = 512;

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

function requireText(value: unknown, label: string, maximum = MAX_PAYLOAD_BYTES) {
  if (typeof value !== 'string' || byteLength(value) === 0) throw new ArcanumValidationError(`${label} is required.`);
  if (byteLength(value) > maximum) throw new ArcanumValidationError(`${label} exceeds ${maximum} UTF-8 bytes.`);
}

function requirePageLimit(functionName: string, args: readonly unknown[]) {
  if (!functionName.toLowerCase().includes('page')) return;
  const limit = args.at(-1);
  if (typeof limit === 'bigint' && limit > MAX_PAGE_SIZE) {
    throw new ArcanumValidationError(`Page limit cannot exceed ${MAX_PAGE_SIZE}.`);
  }
}

export function validateRead(functionName: string, args: readonly unknown[]) {
  requirePageLimit(functionName, args);
}

export function validateWrite(contract: string, functionName: string, args: readonly unknown[]) {
  if (contract === 'messenger' && functionName === 'registerEncryptionKey') requireText(args[0], 'Public key');
  if (contract === 'messenger' && functionName === 'sendMessage') requireText(args[1], 'Message payload');
  if (contract === 'agents' && functionName === 'registerEncryptionKey') requireText(args[0], 'Public key');
  if (contract === 'agents' && functionName === 'sendAgentMessage') requireText(args[1], 'Message payload');

  if (contract === 'groups' && (functionName === 'createGroup' || functionName === 'updateMembers')) {
    const members = args[1] as readonly string[];
    const metadata = args[2];
    const envelopes = args[3] as readonly string[];
    if (!Array.isArray(members) || members.length === 0) throw new ArcanumValidationError('At least one group member is required.');
    if (members.length > MAX_GROUP_MEMBERS) throw new ArcanumValidationError(`A group can contain at most ${MAX_GROUP_MEMBERS} members.`);
    if (!Array.isArray(envelopes) || envelopes.length !== members.length) throw new ArcanumValidationError('Each group member must have one key envelope.');
    requireText(metadata, 'Encrypted group metadata');
    envelopes.forEach((envelope, index) => requireText(envelope, `Envelope ${index}`, MAX_GROUP_ENVELOPE_BYTES));
  }
  if (contract === 'groups' && functionName === 'sendGroupMessage') requireText(args[2], 'Group message payload');

  if (contract === 'bulkSender' && functionName === 'batchSend') {
    const recipients = args[0] as readonly string[];
    const amounts = args[1] as readonly bigint[];
    if (!Array.isArray(recipients) || recipients.length === 0) throw new ArcanumValidationError('At least one recipient is required.');
    if (recipients.length > MAX_BULK_RECIPIENTS) throw new ArcanumValidationError(`A batch can contain at most ${MAX_BULK_RECIPIENTS} recipients.`);
    if (!Array.isArray(amounts) || amounts.length !== recipients.length) throw new ArcanumValidationError('Recipient and amount counts must match.');
    if (recipients.some((recipient) => recipient.toLowerCase() === zeroAddress)) throw new ArcanumValidationError('Recipients cannot contain the zero address.');
    if (amounts.some((amount) => amount <= 0n)) throw new ArcanumValidationError('Every transfer amount must be greater than zero.');
  }

  if (contract === 'gigBoard' && functionName === 'createGig') {
    requireText(args[2], 'Gig title', MAX_GIG_TITLE_BYTES);
    requireText(args[3], 'Gig description', MAX_GIG_DESCRIPTION_BYTES);
    if (typeof args[4] !== 'bigint' || args[4] <= 0n) throw new ArcanumValidationError('Suggested budget must be greater than zero.');
  }
  if (contract === 'gigBoard' && ['startConversation', 'sendMessage'].includes(functionName)) requireText(args[1], 'Encrypted message');
  if (contract === 'gigBoard' && functionName === 'proposeTerms') requireText(args[5], 'Encrypted proposal note');

  if (contract === 'escrow' && ['openDispute', 'submitEvidence'].includes(functionName)) requireText(args[2], 'Evidence URI', MAX_EVIDENCE_URI_BYTES);
  if (contract === 'escrow' && functionName === 'resolveDispute') requireText(args[3], 'Resolution URI', MAX_EVIDENCE_URI_BYTES);
}

export function expectedStaticValue(contract: string, functionName: string, args: readonly unknown[]) {
  if (contract === 'messenger' && functionName === 'sendMessage') return args[2] ? PRIVATE_MESSAGE_FEE : PUBLIC_MESSAGE_FEE;
  if (contract === 'agents' && functionName === 'sendAgentMessage') {
    const payment = args[3] as bigint;
    return (args[2] ? PRIVATE_MESSAGE_FEE : PUBLIC_MESSAGE_FEE) + payment;
  }
  if (contract === 'groups' && functionName === 'sendGroupMessage') return GROUP_MESSAGE_FEE;
  if (contract === 'bulkSender' && functionName === 'batchSend') return (args[1] as readonly bigint[]).reduce((total, amount) => total + amount, 0n);
  return undefined;
}
