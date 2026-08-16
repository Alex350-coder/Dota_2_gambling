import type { Pool } from "pg";
import type { Config } from "@/platform/config";
import { DomainError } from "@/domain/errors";

/**
 * Boot-time RULE-K01 assertion: the `money_mode` singleton row (written once by
 * db/migrations/0009_platform.sql) must agree with the deployed process's MONEY_MODE. A mismatch
 * means either the DB was seeded for a different mode or the process env drifted from the DB it's
 * pointed at — either way the process must refuse to serve traffic rather than guess.
 */
export async function assertMoneyModeMatches(
  pool: Pool,
  config: Pick<Config, "MONEY_MODE">,
): Promise<void> {
  const result = await pool.query<{ mode: "SIMULATED" | "REAL" }>(
    "SELECT mode FROM money_mode WHERE singleton_id = true",
  );

  const row = result.rows[0];
  if (!row) {
    throw new DomainError(
      "MONEY_MODE_FORBIDDEN",
      "money_mode singleton row is missing; database was not migrated correctly (RULE-K01)",
    );
  }

  if (row.mode !== config.MONEY_MODE) {
    throw new DomainError(
      "MONEY_MODE_FORBIDDEN",
      `money_mode singleton (${row.mode}) does not match process MONEY_MODE (${config.MONEY_MODE}) (RULE-K01)`,
      { details: { dbMode: row.mode, processMode: config.MONEY_MODE } },
    );
  }
}
