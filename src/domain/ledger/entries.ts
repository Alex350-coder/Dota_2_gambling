import { DomainError } from "../errors";

/** See Claude/domain/WALLET_LEDGER.md §4. */
export type LedgerTransactionKind =
  | "DEPOSIT"
  | "RESERVE"
  | "MATCH_ESCROW"
  | "RELEASE"
  | "SETTLE_PAYOUT"
  | "SETTLE_COMMISSION"
  | "VOID_REFUND"
  | "WITHDRAWAL"
  | "ADJUSTMENT"
  | "FAUCET";

export type LedgerActorType = "USER" | "ADMIN" | "SYSTEM";

export type LedgerReferenceType = "bet_order" | "match_allocation" | "market" | "payment";

/** A single double-entry line. `signedAmountMinor`: credit positive, debit negative. */
export interface LedgerEntryInput {
  readonly id: string;
  readonly accountKey: string;
  readonly currency: string;
  readonly signedAmountMinor: bigint;
}

export interface LedgerEntry extends LedgerEntryInput {
  readonly transactionId: string;
  readonly createdAt: Date;
}

export interface LedgerTransactionInput {
  readonly id: string;
  readonly kind: LedgerTransactionKind;
  readonly referenceType: LedgerReferenceType;
  readonly referenceId: string;
  readonly idempotencyKey: string;
  readonly actorType: LedgerActorType;
  readonly actorId: string | undefined;
  readonly createdAt: Date;
  readonly entries: readonly LedgerEntryInput[];
}

export interface LedgerTransaction {
  readonly id: string;
  readonly kind: LedgerTransactionKind;
  readonly referenceType: LedgerReferenceType;
  readonly referenceId: string;
  readonly idempotencyKey: string;
  readonly actorType: LedgerActorType;
  readonly actorId: string | undefined;
  readonly createdAt: Date;
  readonly entries: readonly LedgerEntry[];
}

function assertBalanced(input: LedgerTransactionInput): void {
  if (input.entries.length < 2) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "a ledger transaction must have at least two entries (double-entry)",
      { details: { transactionId: input.id, entryCount: input.entries.length } },
    );
  }

  for (const entry of input.entries) {
    if (entry.accountKey.length === 0) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "a ledger entry must have a non-empty accountKey",
        {
          details: { transactionId: input.id, entryId: entry.id },
        },
      );
    }
  }

  const currencies = new Set(input.entries.map((entry) => entry.currency));
  if (currencies.size > 1) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      "a ledger transaction must use a single currency for all its entries (RULE-F16)",
      { details: { transactionId: input.id, currencies: [...currencies] } },
    );
  }

  let sum = 0n;
  for (const entry of input.entries) {
    sum += entry.signedAmountMinor;
  }

  if (sum !== 0n) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "a ledger transaction's entries must sum to zero (RULE-F05 / INV-02)",
      { details: { transactionId: input.id, sum: sum.toString() } },
    );
  }
}

/**
 * Builds an immutable, balanced double-entry ledger transaction. Append-only
 * by convention — this module has no update/delete operation (RULE-F04).
 */
export function createLedgerTransaction(input: LedgerTransactionInput): LedgerTransaction {
  assertBalanced(input);

  return {
    id: input.id,
    kind: input.kind,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    idempotencyKey: input.idempotencyKey,
    actorType: input.actorType,
    actorId: input.actorId,
    createdAt: input.createdAt,
    entries: input.entries.map((entry) => ({
      ...entry,
      transactionId: input.id,
      createdAt: input.createdAt,
    })),
  };
}
