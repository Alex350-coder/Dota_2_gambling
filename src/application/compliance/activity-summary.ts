import { periodStart, sumSessionMinutes, type RollingLimitPeriod } from "@/domain/compliance";
import type { Clock, LedgerWriter, SessionRepository, UnitOfWork } from "@/domain/ports";

export type ActivitySummaryPeriod = RollingLimitPeriod | "ALL";

export interface ActivitySummary {
  readonly period: ActivitySummaryPeriod;
  readonly totalStakedMinor: bigint;
  readonly totalWonMinor: bigint;
  readonly netResultMinor: bigint;
  readonly betCount: number;
  readonly timeOnSiteMinutes: number;
}

export interface ActivitySummaryInput {
  readonly userId: string;
  readonly currency: string;
  readonly period: ActivitySummaryPeriod;
}

export interface ActivitySummaryDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly ledger: LedgerWriter<Tx>;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly clock: Clock;
}

/** Never before `EXTERNAL_FUNDING`/`FAUCET` existed for this account, and never a negative
 * window — the epoch is a safe "since the beginning" bound for the "ALL" period. */
const EPOCH = new Date(0);

/**
 * Every figure is read straight from the ledger (or, for time on site, the session table) at
 * request time — never a cached counter (RESPONSIBLE_GAMBLING.md §4, T-811). `netResultMinor` is
 * the sum of every `USER_AVAILABLE:<userId>` entry from betting activity — `RESERVE` (stake
 * debited), `SETTLE_PAYOUT` (win credited), `VOID_REFUND` and `RELEASE` (unmatched/void stake
 * returned) — which nets to zero for money that was staked and fully returned, and is negative
 * only for money actually lost to a settled counterparty.
 */
export class ActivitySummaryUseCase<Tx> {
  constructor(private readonly deps: ActivitySummaryDeps<Tx>) {}

  async execute(input: ActivitySummaryInput): Promise<ActivitySummary> {
    const now = this.deps.clock.now();
    const since = input.period === "ALL" ? EPOCH : periodStart(input.period, now);
    const availableAccount = `USER_AVAILABLE:${input.userId}`;
    const lockedAccount = `USER_LOCKED:${input.userId}`;

    return this.deps.uow.run(async (tx) => {
      const [reserved, settled, voided, released, betCount, sessions] = await Promise.all([
        this.deps.ledger.sumEntriesSince(tx, availableAccount, input.currency, "RESERVE", since),
        this.deps.ledger.sumEntriesSince(
          tx,
          availableAccount,
          input.currency,
          "SETTLE_PAYOUT",
          since,
        ),
        this.deps.ledger.sumEntriesSince(
          tx,
          availableAccount,
          input.currency,
          "VOID_REFUND",
          since,
        ),
        this.deps.ledger.sumEntriesSince(tx, availableAccount, input.currency, "RELEASE", since),
        this.deps.ledger.countTransactionsSince(
          tx,
          lockedAccount,
          input.currency,
          "RESERVE",
          since,
        ),
        this.deps.sessions(tx).listByUserIdSince(input.userId, since),
      ]);

      return {
        period: input.period,
        totalStakedMinor: -reserved,
        totalWonMinor: settled,
        netResultMinor: reserved + settled + voided + released,
        betCount,
        timeOnSiteMinutes: sumSessionMinutes(sessions, since, now),
      };
    });
  }
}
