import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork } from "@/infra/db/uow";
import { LedgerService } from "@/infra/db/ledger";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";
import { toBigIntRow } from "../../helpers/pg-bigint";

class SystemClock {
  now(): Date {
    return new Date();
  }
}

const ITERATIONS = 50;
const CREDITORS = 5;
const CREDIT_MINOR = 1_000n;

/**
 * CC-05 / FIN-11 (`Claude/domain/MATCHING_ENGINE.md` §8, `Claude/Testing.md` row 11) — real
 * Postgres, `Promise.all` races `CREDITORS` concurrent FAUCET credits against one wallet per
 * iteration. `LedgerService.post` is `wallets`' sole writer (RULE-F03) and locks the touched
 * wallet row `FOR UPDATE`, so this proves the lock prevents a lost update under real contention
 * rather than merely asserting the (already domain-tested) balance math.
 */
describe("LedgerService.post concurrent wallet credits (CC-05, FIN-11)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const ledger = new LedgerService(ids, clock);

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
      [userId, `bettor-${randomUUID()}@example.test`],
    );
    await pool.query(
      "INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', 0, 0)",
      [userId],
    );
    return userId;
  }

  it("final balance = sum of all concurrent credits, no lost update", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const userId = await createUser();

      const results = await Promise.allSettled(
        Array.from({ length: CREDITORS }, () =>
          uow.run((tx) =>
            ledger.post(tx, {
              id: ids.next(),
              kind: "FAUCET",
              referenceType: "bet_order",
              referenceId: randomUUID(),
              idempotencyKey: randomUUID(),
              actorType: "SYSTEM",
              actorId: undefined,
              entries: [
                {
                  accountKey: `USER_AVAILABLE:${userId}`,
                  currency: "PEN",
                  signedAmountMinor: CREDIT_MINOR,
                },
                {
                  accountKey: "SIMULATION_FAUCET",
                  currency: "PEN",
                  signedAmountMinor: -CREDIT_MINOR,
                },
              ],
            }),
          ),
        ),
      );
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      const wallet = await pool
        .query("SELECT available_minor FROM wallets WHERE user_id = $1", [userId])
        .then((r) => toBigIntRow(r.rows[0] as { available_minor: bigint }, ["available_minor"]));

      expect(wallet.available_minor).toBeGreaterThanOrEqual(0n);
      expect(wallet.available_minor).toBe(CREDIT_MINOR * BigInt(CREDITORS));
    }
  }, 60_000);
});
