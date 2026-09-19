import type {
  LedgerActorType,
  LedgerReferenceType,
  LedgerTransaction,
  LedgerTransactionKind,
} from "../ledger";

/** One posted entry as read back for a transaction-history listing, newest first. */
export interface LedgerEntryRecord {
  readonly id: string;
  readonly transactionId: string;
  readonly kind: LedgerTransactionKind;
  readonly accountKey: string;
  readonly currency: string;
  readonly signedAmountMinor: bigint;
  readonly createdAt: Date;
}

export interface ListEntriesForAccountInput {
  readonly page: number;
  readonly limit: number;
}

export interface ListEntriesForAccountResult {
  readonly entries: readonly LedgerEntryRecord[];
  readonly total: number;
}

/** A ledger entry as posted by a caller — the writer assigns `id`/`createdAt`. */
export interface LedgerPostEntry {
  readonly accountKey: string;
  readonly currency: string;
  readonly signedAmountMinor: bigint;
}

export interface LedgerPostInput {
  readonly id: string;
  readonly kind: LedgerTransactionKind;
  readonly referenceType: LedgerReferenceType;
  readonly referenceId: string;
  readonly idempotencyKey: string;
  readonly actorType: LedgerActorType;
  readonly actorId: string | undefined;
  readonly entries: readonly LedgerPostEntry[];
}

/**
 * `Tx` is deliberately opaque here — the domain layer must not import a driver/ORM type
 * (RULE-A01). The sole writer of `wallets` (RULE-F03): infra binds `Tx` to the concrete
 * `UnitOfWork` transaction handle so every post happens inside the caller's transaction.
 */
export interface LedgerWriter<Tx = unknown> {
  /**
   * Posts a balanced double-entry transaction and applies its `USER_AVAILABLE`/`USER_LOCKED`
   * deltas to `wallets`. Replays `idempotencyKey` as a no-op returning the existing
   * transaction (RULE-F14).
   */
  post(tx: Tx, input: LedgerPostInput): Promise<LedgerTransaction>;
  /**
   * The current balance of one ledger account (`SUM(signed_amount_minor)`), narrowly scoped to
   * back settlement's hard escrow-zero assertion (T-609, SETTLEMENT.md §4 phase 3) without
   * giving the domain layer general SQL access (RULE-A01) — this stays on the writer port
   * rather than a new one since `LedgerService` already owns `ledger_entries` reads/writes.
   */
  balanceOf(tx: Tx, accountKey: string, currency: string): Promise<bigint>;

  /**
   * Sum of `signed_amount_minor` posted to `accountKey` by transactions of `kind` since
   * `since` (inclusive) — backs ledger-derived caps such as MET-RG-04's simulated-credit daily
   * cap, which must never be enforced against a cached counter.
   */
  sumEntriesSince(
    tx: Tx,
    accountKey: string,
    currency: string,
    kind: LedgerTransactionKind,
    since: Date,
  ): Promise<bigint>;

  /**
   * The number of distinct transactions of `kind` posted to `accountKey` since `since`
   * (inclusive) — backs the activity summary's ledger-derived bet count (T-811,
   * RESPONSIBLE_GAMBLING.md §4), which must never come from a cached counter either.
   */
  countTransactionsSince(
    tx: Tx,
    accountKey: string,
    currency: string,
    kind: LedgerTransactionKind,
    since: Date,
  ): Promise<number>;

  /**
   * A page of `accountKey`'s posted entries, newest first, with a DB-level `LIMIT`/`OFFSET`
   * (RULE-G04) — backs the account transaction-history view (T-805). Unlike `balanceOf` this
   * returns rows rather than an aggregate, but stays on this port for the same reason:
   * `LedgerService` already owns all `ledger_entries` reads/writes.
   */
  listEntriesForAccount(
    tx: Tx,
    accountKey: string,
    currency: string,
    input: ListEntriesForAccountInput,
  ): Promise<ListEntriesForAccountResult>;
}
