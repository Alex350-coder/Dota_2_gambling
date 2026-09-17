import { DomainError } from "@/domain/errors";
import { assertActiveAccount } from "@/domain/identity";
import { exceedsCap, negate, toMinor, type Minor } from "@/domain/money";
import type {
  AuditWriter,
  Clock,
  IdGenerator,
  LedgerWriter,
  UnitOfWork,
  UserRepository,
  WalletRepository,
  Wallet,
} from "@/domain/ports";
import { simulatedCreditEvent } from "@/application/audit/writer";

export interface SimulatedCreditInput {
  readonly userId: string;
  readonly currency: string;
  readonly amountMinor: bigint;
  readonly idempotencyKey: string;
}

export interface SimulatedCreditResult {
  readonly wallet: Wallet;
  readonly ledgerTransactionId: string;
}

export interface SimulatedCreditDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly wallets: (tx: Tx, ownerId: string) => WalletRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
  /** `true` only while `MONEY_MODE=SIMULATED` (RULE-K02) — checked here in addition to the
   * config-schema-level rejection of `MONEY_MODE=REAL`, so this use case fails closed even if
   * that boot-time guard is ever relaxed by the Production Readiness Gate (T-1009). */
  readonly simulatedModeEnabled: boolean;
  readonly dailyCapMinor: bigint;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Credits a user's wallet from the `SIMULATION_FAUCET` contra account
 * (WALLET_LEDGER.md §6 flow 1), capped per user per day (MET-RG-04). The cap is enforced against
 * the sum of today's `FAUCET` ledger entries, never a cached counter, so it cannot be bypassed by
 * concurrent requests racing a counter update — the whole check-then-post runs inside the wallet
 * row's `FOR UPDATE` lock.
 */
export class SimulatedCreditUseCase<Tx> {
  constructor(private readonly deps: SimulatedCreditDeps<Tx>) {}

  async execute(input: SimulatedCreditInput): Promise<SimulatedCreditResult> {
    if (!this.deps.simulatedModeEnabled) {
      throw new DomainError(
        "MONEY_MODE_FORBIDDEN",
        "simulated credit is only available while MONEY_MODE=SIMULATED",
      );
    }

    const amountMinor: Minor = toMinor(input.amountMinor);
    if (amountMinor <= 0n) {
      throw new DomainError("VALIDATION_FAILED", "amount must be positive", {
        details: { field: "amountMinor" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const user = await this.deps.users(tx).findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }
      assertActiveAccount(user.status);

      const accountKey = `USER_AVAILABLE:${input.userId}`;
      const now = this.deps.clock.now();
      const since = startOfUtcDay(now);
      const creditedToday = await this.deps.ledger.sumEntriesSince(
        tx,
        accountKey,
        input.currency,
        "FAUCET",
        since,
      );
      if (exceedsCap(creditedToday, amountMinor, this.deps.dailyCapMinor)) {
        throw new DomainError("LIMIT_EXCEEDED", "simulated credit daily cap would be exceeded", {
          details: {
            kind: "SIMULATED_CREDIT_DAILY_CAP",
            creditedTodayMinor: creditedToday.toString(),
            requestedMinor: amountMinor.toString(),
            capMinor: this.deps.dailyCapMinor.toString(),
            resetAt: new Date(since.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
          },
        });
      }

      await this.deps.wallets(tx, input.userId).ensureForUpdate(input.currency);

      const transaction = await this.deps.ledger.post(tx, {
        id: this.deps.ids.next(),
        kind: "FAUCET",
        referenceType: "payment",
        referenceId: input.userId,
        idempotencyKey: input.idempotencyKey,
        actorType: "USER",
        actorId: input.userId,
        entries: [
          {
            accountKey: "SIMULATION_FAUCET",
            currency: input.currency,
            signedAmountMinor: negate(amountMinor),
          },
          {
            accountKey,
            currency: input.currency,
            signedAmountMinor: amountMinor,
          },
        ],
      });

      await this.deps.audit.record(
        tx,
        simulatedCreditEvent(input.userId, transaction.id, amountMinor.toString()),
      );

      const wallet = await this.deps.wallets(tx, input.userId).findByCurrency(input.currency);
      if (!wallet) {
        throw new DomainError("RESOURCE_NOT_FOUND", "wallet not found after crediting", {
          details: { userId: input.userId, currency: input.currency },
        });
      }

      return { wallet, ledgerTransactionId: transaction.id };
    });
  }
}
