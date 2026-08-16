import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { pgAdvisoryXactLock } from "@/infra/db/locks";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("pgAdvisoryXactLock", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("resolves when the lock is free", async () => {
    await db.transaction(async (tx) => {
      await expect(pgAdvisoryXactLock(tx, "market-1")).resolves.toBeUndefined();
    });
  });

  it("blocks a second holder of the same key until the first transaction commits", async () => {
    let secondAcquiredAt = 0;
    let firstReleasedAt = 0;

    const first = db.transaction(async (tx) => {
      await pgAdvisoryXactLock(tx, "market-2");
      await new Promise((resolve) => setTimeout(resolve, 200));
      firstReleasedAt = Date.now();
    });

    // Give the first transaction a head start so it acquires the lock first.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = db.transaction(async (tx) => {
      await pgAdvisoryXactLock(tx, "market-2");
      secondAcquiredAt = Date.now();
    });

    await Promise.all([first, second]);

    expect(secondAcquiredAt).toBeGreaterThanOrEqual(firstReleasedAt);
  });

  it("does not block a holder of a different key", async () => {
    await db.transaction(async (tx1) => {
      await pgAdvisoryXactLock(tx1, "market-3a");

      await db.transaction(async (tx2) => {
        await expect(pgAdvisoryXactLock(tx2, "market-3b")).resolves.toBeUndefined();
      });
    });
  });
});
