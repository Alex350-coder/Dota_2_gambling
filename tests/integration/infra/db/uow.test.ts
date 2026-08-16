import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork } from "@/infra/db/uow";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("DrizzleUnitOfWork", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM games");
  });

  it("applies the requested isolation level to the transaction", async () => {
    const observed = await uow.run(
      async (tx) => {
        const result = await tx.execute(sql`SHOW transaction_isolation`);
        return (result.rows[0] as { transaction_isolation: string }).transaction_isolation;
      },
      { isolation: "REPEATABLE READ" },
    );

    expect(observed).toBe("repeatable read");
  });

  it("commits all writes performed inside a successful run()", async () => {
    await uow.run(async (tx) => {
      await tx.execute(sql`INSERT INTO games (slug, name) VALUES ('committed-game', 'Game')`);
    });

    const result = await pool.query("SELECT slug FROM games WHERE slug = 'committed-game'");
    expect(result.rows).toHaveLength(1);
  });

  it("rolls back all writes when the callback throws", async () => {
    await expect(
      uow.run(async (tx) => {
        await tx.execute(sql`INSERT INTO games (slug, name) VALUES ('rolled-back-game', 'Game')`);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const result = await pool.query("SELECT slug FROM games WHERE slug = 'rolled-back-game'");
    expect(result.rows).toHaveLength(0);
  });

  it("retries up to the configured attempts on a deadlock (40P01), then succeeds", async () => {
    let calls = 0;
    const work = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        const err = new Error("simulated deadlock") as Error & { code: string };
        err.code = "40P01";
        throw err;
      }
      return "ok";
    });

    const result = await uow.run(work, { retry: { attempts: 3 } });

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the configured attempts and surfaces the last error", async () => {
    const work = vi.fn(async () => {
      const err = new Error("simulated serialization failure") as Error & { code: string };
      err.code = "40001";
      throw err;
    });

    await expect(uow.run(work, { retry: { attempts: 3 } })).rejects.toThrow(
      "simulated serialization failure",
    );
    expect(work).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable errors", async () => {
    const work = vi.fn(async () => {
      throw new Error("not retryable");
    });

    await expect(uow.run(work, { retry: { attempts: 3 } })).rejects.toThrow("not retryable");
    expect(work).toHaveBeenCalledTimes(1);
  });
});
