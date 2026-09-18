import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { LedgerService } from "@/infra/db/ledger";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { ActivitySummaryUseCase } from "@/application/compliance";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

class TestClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
}

describe("ActivitySummaryUseCase (T-811)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new TestClock(new Date("2026-01-15T12:00:00.000Z"));
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
      [userId, `player-${randomUUID()}@example.test`],
    );
    await pool.query(
      "INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', 10000000, 0)",
      [userId],
    );
    return userId;
  }

  async function post(
    tx: DbTx,
    kind: "RESERVE" | "SETTLE_PAYOUT" | "VOID_REFUND" | "RELEASE",
    entries: { accountKey: string; signedAmountMinor: bigint }[],
  ): Promise<void> {
    await ledger.post(tx, {
      id: ids.next(),
      kind,
      referenceType: "bet_order",
      referenceId: ids.next(),
      idempotencyKey: `test:${ids.next()}`,
      actorType: "USER",
      actorId: undefined,
      entries: entries.map((entry) => ({ ...entry, currency: "PEN" })),
    });
  }

  it("computes staked/won/net/count from the ledger, never a cached figure", async () => {
    const userId = await createUser();
    const available = `USER_AVAILABLE:${userId}`;
    const locked = `USER_LOCKED:${userId}`;

    await uow.run(async (tx) => {
      // Bet 1: settles as a win — staked 1_000, returned 1_800 (profit 800).
      await post(tx, "RESERVE", [
        { accountKey: available, signedAmountMinor: -1_000n },
        { accountKey: locked, signedAmountMinor: 1_000n },
      ]);
      await post(tx, "SETTLE_PAYOUT", [
        { accountKey: "MARKET_ESCROW:m1", signedAmountMinor: -1_800n },
        { accountKey: available, signedAmountMinor: 1_800n },
      ]);

      // Bet 2: never matched, voided — staked 500, fully refunded.
      await post(tx, "RESERVE", [
        { accountKey: available, signedAmountMinor: -500n },
        { accountKey: locked, signedAmountMinor: 500n },
      ]);
      await post(tx, "VOID_REFUND", [
        { accountKey: locked, signedAmountMinor: -500n },
        { accountKey: available, signedAmountMinor: 500n },
      ]);

      // Bet 3: partially released — staked 300, fully released back unmatched.
      await post(tx, "RESERVE", [
        { accountKey: available, signedAmountMinor: -300n },
        { accountKey: locked, signedAmountMinor: 300n },
      ]);
      await post(tx, "RELEASE", [
        { accountKey: locked, signedAmountMinor: -300n },
        { accountKey: available, signedAmountMinor: 300n },
      ]);
    });

    const summary = await activitySummary.execute({ userId, currency: "PEN", period: "ALL" });

    expect(summary.totalStakedMinor).toBe(1_800n);
    expect(summary.totalWonMinor).toBe(1_800n);
    expect(summary.netResultMinor).toBe(800n);
    expect(summary.betCount).toBe(3);
  });

  it("scopes totals to the requested rolling period, excluding older activity", async () => {
    const userId = await createUser();
    const available = `USER_AVAILABLE:${userId}`;
    const locked = `USER_LOCKED:${userId}`;

    await uow.run(async (tx) => {
      await post(tx, "RESERVE", [
        { accountKey: available, signedAmountMinor: -1_000n },
        { accountKey: locked, signedAmountMinor: 1_000n },
      ]);
    });

    // Advance the clock 40 days — the DAY/WEEK/MONTH windows no longer cover the bet above.
    clock.set(new Date(clock.now().getTime() + 40 * 24 * 60 * 60 * 1_000));

    const day = await activitySummary.execute({ userId, currency: "PEN", period: "DAY" });
    const all = await activitySummary.execute({ userId, currency: "PEN", period: "ALL" });

    expect(day.totalStakedMinor).toBe(0n);
    expect(day.betCount).toBe(0);
    expect(all.totalStakedMinor).toBe(1_000n);
    expect(all.betCount).toBe(1);

    clock.set(new Date("2026-01-15T12:00:00.000Z"));
  });

  it("sums time on site from session records clipped to the window", async () => {
    const userId = await createUser();
    const sessionId = ids.next();
    await pool.query(
      "INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        sessionId,
        userId,
        `hash-${randomUUID()}`,
        new Date("2026-01-15T10:00:00.000Z"),
        new Date("2026-01-15T10:25:00.000Z"),
        new Date("2026-01-16T10:00:00.000Z"),
      ],
    );

    const summary = await activitySummary.execute({ userId, currency: "PEN", period: "DAY" });

    expect(summary.timeOnSiteMinutes).toBe(25);
  });
});
