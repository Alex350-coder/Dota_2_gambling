import { afterAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../../helpers/test-db-config";

describe("createPool", () => {
  const config = testDbConfig();
  const pool = createPool(config);

  afterAll(async () => {
    await pool.end();
  });

  it("connects and can run a trivial query", async () => {
    const result = await pool.query("SELECT 1 as one");
    expect(result.rows[0]).toEqual({ one: 1 });
  });

  // Postgres reports GUC durations in the largest whole unit that fits (e.g. "5000ms" -> "5s"),
  // so parse back to milliseconds instead of comparing raw strings.
  function parsePgDurationMs(value: string): number {
    const match = /^(\d+)(ms|s|min|h|d)$/.exec(value);
    if (!match) throw new Error(`unrecognized Postgres duration: ${value}`);
    const amount = Number(match[1]);
    const unit = match[2] as "ms" | "s" | "min" | "h" | "d";
    const unitToMs: Record<typeof unit, number> = {
      ms: 1,
      s: 1000,
      min: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return amount * unitToMs[unit];
  }

  it("applies DATABASE_STATEMENT_TIMEOUT_MS to leased connections", async () => {
    const client = await pool.connect();
    try {
      const result = await client.query("SHOW statement_timeout");
      expect(parsePgDurationMs(result.rows[0].statement_timeout)).toBe(
        config.DATABASE_STATEMENT_TIMEOUT_MS,
      );
    } finally {
      client.release();
    }
  });

  it("applies DATABASE_LOCK_TIMEOUT_MS to leased connections", async () => {
    const client = await pool.connect();
    try {
      const result = await client.query("SHOW lock_timeout");
      expect(parsePgDurationMs(result.rows[0].lock_timeout)).toBe(config.DATABASE_LOCK_TIMEOUT_MS);
    } finally {
      client.release();
    }
  });
});
