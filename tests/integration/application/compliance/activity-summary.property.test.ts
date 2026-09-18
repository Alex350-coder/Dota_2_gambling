import { afterAll, beforeAll, describe, it } from "vitest";
import fc from "fast-check";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { LedgerService } from "@/infra/db/ledger";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { ActivitySummaryUseCase } from "@/application/compliance";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

class FixedClock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
  }
}

type BetOutcome =
  | { kind: "SETTLE"; stakeMinor: bigint; payoutMinor: bigint }
  | { kind: "VOID"; stakeMinor: bigint }
  | { kind: "RELEASE"; stakeMinor: bigint };

const outcomeArb: fc.Arbitrary<BetOutcome> = fc.oneof(
  fc.record({
    kind: fc.constant("SETTLE" as const),
    stakeMinor: fc.bigInt({ min: 1n, max: 100_000n }),
    payoutMinor: fc.bigInt({ min: 1n, max: 200_000n }),
  }),
  fc.record({
    kind: fc.constant("VOID" as const),
    stakeMinor: fc.bigInt({ min: 1n, max: 100_000n }),
  }),
  fc.record({
    kind: fc.constant("RELEASE" as const),
    stakeMinor: fc.bigInt({ min: 1n, max: 100_000n }),
  }),
);

const lifecycleArb = fc.array(outcomeArb, { minLength: 0, maxLength: 6 });

/**
 * Property (T-811, RESPONSIBLE_GAMBLING.md §8: "activity summary equals ledger-derived totals"):
 * for any sequence of bet lifecycles, `ActivitySummaryUseCase`'s totals must equal the totals a
 * fresh, independent walk over the same ledger entries produces — the use case must never diverge
 * from raw ledger truth, no matter the mix of wins/voids/releases.
 */
describe("property: ActivitySummaryUseCase equals ledger-derived totals (T-811)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new FixedClock(new Date("2026-02-01T00:00:00.000Z"));
  const ledger = new LedgerService(ids, clock);
  const sessions = (tx: DbTx) => new DrizzleSessionRepository(tx);
  const activitySummary = new ActivitySummaryUseCase<DbTx>({ uow, ledger, sessions, clock });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `player-${ids.next()}@example.test`],
    );
    await pool.query(
      "INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', 100000000, 0)",
      [userId],
    );
    return userId;
  }

  it("matches a hand-computed sum over the same lifecycle for every run", async () => {
    await fc.assert(
      fc.asyncProperty(lifecycleArb, async (lifecycle) => {
        const userId = await createUser();
        const available = `USER_AVAILABLE:${userId}`;
        const locked = `USER_LOCKED:${userId}`;

        let expectedStaked = 0n;
        let expectedWon = 0n;
        let expectedNet = 0n;
        let expectedBetCount = 0;

        await uow.run(async (tx) => {
          for (const outcome of lifecycle) {
            await ledger.post(tx, {
              id: ids.next(),
              kind: "RESERVE",
              referenceType: "bet_order",
              referenceId: ids.next(),
              idempotencyKey: `test:${ids.next()}`,
              actorType: "USER",
              actorId: undefined,
              entries: [
                { accountKey: available, currency: "PEN", signedAmountMinor: -outcome.stakeMinor },
                { accountKey: locked, currency: "PEN", signedAmountMinor: outcome.stakeMinor },
              ],
            });
            expectedStaked += outcome.stakeMinor;
            expectedNet -= outcome.stakeMinor;
            expectedBetCount += 1;

            if (outcome.kind === "SETTLE") {
              await ledger.post(tx, {
                id: ids.next(),
                kind: "SETTLE_PAYOUT",
                referenceType: "match_allocation",
                referenceId: ids.next(),
                idempotencyKey: `test:${ids.next()}`,
                actorType: "SYSTEM",
                actorId: undefined,
                entries: [
                  {
                    accountKey: "MARKET_ESCROW:m",
                    currency: "PEN",
                    signedAmountMinor: -outcome.payoutMinor,
                  },
                  {
                    accountKey: available,
                    currency: "PEN",
                    signedAmountMinor: outcome.payoutMinor,
                  },
                ],
              });
              expectedWon += outcome.payoutMinor;
              expectedNet += outcome.payoutMinor;
            } else {
              await ledger.post(tx, {
                id: ids.next(),
                kind: outcome.kind === "VOID" ? "VOID_REFUND" : "RELEASE",
                referenceType: "bet_order",
                referenceId: ids.next(),
                idempotencyKey: `test:${ids.next()}`,
                actorType: "SYSTEM",
                actorId: undefined,
                entries: [
                  { accountKey: locked, currency: "PEN", signedAmountMinor: -outcome.stakeMinor },
                  { accountKey: available, currency: "PEN", signedAmountMinor: outcome.stakeMinor },
                ],
              });
              expectedNet += outcome.stakeMinor;
            }
          }
        });

        const summary = await activitySummary.execute({ userId, currency: "PEN", period: "ALL" });

        return (
          summary.totalStakedMinor === expectedStaked &&
          summary.totalWonMinor === expectedWon &&
          summary.netResultMinor === expectedNet &&
          summary.betCount === expectedBetCount
        );
      }),
      { numRuns: 15 },
    );
  }, 60_000);
});
