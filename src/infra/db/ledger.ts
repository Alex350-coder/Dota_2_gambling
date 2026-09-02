import { and, eq, sql } from "drizzle-orm";
import type { Clock, IdGenerator, LedgerPostInput, LedgerWriter } from "@/domain/ports";
import { createLedgerTransaction, type LedgerTransaction } from "@/domain/ledger";
import { DomainError } from "@/domain/errors";
import { ledgerEntries, ledgerTransactions } from "./schema/ledger";
import { wallets } from "./schema/wallet";
import type { DbTx } from "./uow";

/** `USER_AVAILABLE:<userId>` / `USER_LOCKED:<userId>` — the only accounts wallets project. */
const USER_WALLET_ACCOUNT = /^(USER_AVAILABLE|USER_LOCKED):(.+)$/;

interface WalletDelta {
  readonly currency: string;
  availableDelta: bigint;
  lockedDelta: bigint;
}

/**
 * Sole writer of `wallets` (RULE-F03). Every post happens inside the caller's `UnitOfWork`
 * transaction: builds a balanced transaction via `createLedgerTransaction()` (reusing the
 * domain's balance/currency checks, not reimplementing them), inserts
 * `ledger_transactions`/`ledger_entries`, then locks and updates every touched wallet row
 * `FOR UPDATE` in ascending `user_id` order (RULE-D07).
 */
export class LedgerService implements LedgerWriter<DbTx> {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async post(tx: DbTx, input: LedgerPostInput): Promise<LedgerTransaction> {
    const existing = await this.findByIdempotencyKey(tx, input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const txn = createLedgerTransaction({
      id: input.id,
      kind: input.kind,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      actorType: input.actorType,
      actorId: input.actorId,
      createdAt: this.clock.now(),
      entries: input.entries.map((entry) => ({ ...entry, id: this.ids.next() })),
    });

    await tx.insert(ledgerTransactions).values({
      id: txn.id,
      kind: txn.kind,
      referenceType: txn.referenceType,
      referenceId: txn.referenceId,
      idempotencyKey: txn.idempotencyKey,
      actorType: txn.actorType,
      actorId: txn.actorId ?? null,
      createdAt: txn.createdAt,
    });

    await tx.insert(ledgerEntries).values(
      txn.entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        accountKey: entry.accountKey,
        currency: entry.currency,
        signedAmountMinor: entry.signedAmountMinor,
        createdAt: entry.createdAt,
      })),
    );

    await this.applyWalletDeltas(tx, txn);

    return txn;
  }

  async balanceOf(tx: DbTx, accountKey: string, currency: string): Promise<bigint> {
    const [row] = await tx
      .select({ total: sql<string | null>`sum(${ledgerEntries.signedAmountMinor})` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountKey, accountKey), eq(ledgerEntries.currency, currency)));

    return row?.total === null || row?.total === undefined ? 0n : BigInt(row.total);
  }

  private async findByIdempotencyKey(
    tx: DbTx,
    idempotencyKey: string,
  ): Promise<LedgerTransaction | null> {
    const [transaction] = await tx
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, idempotencyKey));
    if (!transaction) {
      return null;
    }

    const entries = await tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, transaction.id));

    return {
      id: transaction.id,
      kind: transaction.kind,
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      idempotencyKey: transaction.idempotencyKey,
      actorType: transaction.actorType,
      actorId: transaction.actorId ?? undefined,
      createdAt: transaction.createdAt,
      entries: entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        accountKey: entry.accountKey,
        currency: entry.currency,
        signedAmountMinor: entry.signedAmountMinor,
        createdAt: entry.createdAt,
      })),
    };
  }

  private async applyWalletDeltas(tx: DbTx, txn: LedgerTransaction): Promise<void> {
    const deltasByUser = new Map<string, WalletDelta>();

    for (const entry of txn.entries) {
      const match = USER_WALLET_ACCOUNT.exec(entry.accountKey);
      const accountType = match?.[1];
      const userId = match?.[2];
      if (!accountType || !userId) {
        continue;
      }
      const delta = deltasByUser.get(userId) ?? {
        currency: entry.currency,
        availableDelta: 0n,
        lockedDelta: 0n,
      };
      if (accountType === "USER_AVAILABLE") {
        delta.availableDelta += entry.signedAmountMinor;
      } else {
        delta.lockedDelta += entry.signedAmountMinor;
      }
      deltasByUser.set(userId, delta);
    }

    // RULE-D07: lock wallets in ascending user_id order to avoid deadlocking against
    // other transactions touching an overlapping set of wallets.
    const userIds = [...deltasByUser.keys()].sort();
    for (const userId of userIds) {
      const delta = deltasByUser.get(userId);
      if (!delta) {
        continue;
      }

      const [wallet] = await tx
        .select()
        .from(wallets)
        .where(and(eq(wallets.userId, userId), eq(wallets.currency, delta.currency)))
        .for("update");

      if (!wallet) {
        throw new DomainError(
          "RESOURCE_NOT_FOUND",
          `wallet not found for user ${userId} in ${delta.currency}`,
          { details: { userId, currency: delta.currency } },
        );
      }

      await tx
        .update(wallets)
        .set({
          availableMinor: wallet.availableMinor + delta.availableDelta,
          lockedMinor: wallet.lockedMinor + delta.lockedDelta,
          version: wallet.version + 1n,
          updatedAt: this.clock.now(),
        })
        .where(and(eq(wallets.userId, userId), eq(wallets.currency, delta.currency)));
    }
  }
}
