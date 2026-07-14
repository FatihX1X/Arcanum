import { isAddress, parseUnits } from 'viem';

export type BulkDraftRow = {
  recipient: string;
  amount: string;
};

export type PreparedBulkRows = {
  recipients: `0x${string}`[];
  amounts: bigint[];
  totalAmount: bigint;
};

export function parseBulkPaste(value: string): BulkDraftRow[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [recipient = '', amount = '', ...extra] = line.split(/[;,\s]+/);
      if (extra.length > 0 || !recipient || !amount) {
        throw new Error('BULK_ROW_FORMAT_INVALID');
      }
      return { recipient, amount };
    });
}

export function prepareBulkRows(
  rows: readonly BulkDraftRow[],
  sender?: string,
  maxRecipients = 100,
): PreparedBulkRows {
  if (rows.length === 0) throw new Error('BULK_RECIPIENTS_REQUIRED');
  if (rows.length > maxRecipients) throw new Error('BULK_TOO_MANY_RECIPIENTS');

  const normalizedSender = sender?.toLowerCase();
  const seen = new Set<string>();
  const prepared = rows.map((row) => {
    const recipient = row.recipient.trim();
    const amount = row.amount.trim();
    if (!isAddress(recipient)) throw new Error('BULK_RECIPIENT_INVALID');
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount)) throw new Error('BULK_AMOUNT_INVALID');

    const normalizedRecipient = recipient.toLowerCase();
    if (normalizedRecipient === normalizedSender) throw new Error('BULK_RECIPIENT_SELF');
    if (seen.has(normalizedRecipient)) throw new Error('BULK_RECIPIENT_DUPLICATE');
    seen.add(normalizedRecipient);

    const parsedAmount = parseUnits(amount, 6);
    if (parsedAmount <= 0n) throw new Error('BULK_AMOUNT_INVALID');
    return { recipient: recipient as `0x${string}`, amount: parsedAmount };
  });

  prepared.sort((left, right) => {
    const leftAddress = BigInt(left.recipient.toLowerCase());
    const rightAddress = BigInt(right.recipient.toLowerCase());
    return leftAddress < rightAddress ? -1 : leftAddress > rightAddress ? 1 : 0;
  });

  return {
    recipients: prepared.map((row) => row.recipient),
    amounts: prepared.map((row) => row.amount),
    totalAmount: prepared.reduce((sum, row) => sum + row.amount, 0n),
  };
}
