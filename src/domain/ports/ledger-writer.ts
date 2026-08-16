import type {
  LedgerActorType,
  LedgerReferenceType,
  LedgerTransaction,
  LedgerTransactionKind,
} from "../ledger";

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
}
