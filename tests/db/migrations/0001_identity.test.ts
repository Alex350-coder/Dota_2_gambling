import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0001_identity migration", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts a valid adult user", async () => {
    const result = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, $2) RETURNING id`,
      ["adult@example.test", "1990-01-01"],
    );
    expect(result.rows).toHaveLength(1);
  });

  it("rejects a user under 18 (chk_users_age)", async () => {
    const underageDob = new Date();
    underageDob.setFullYear(underageDob.getFullYear() - 10);

    await expect(
      pool.query(`INSERT INTO users (email, date_of_birth) VALUES ($1, $2)`, [
        "minor@example.test",
        underageDob.toISOString().slice(0, 10),
      ]),
    ).rejects.toThrow(/chk_users_age/);
  });

  it("rejects a duplicate email", async () => {
    await pool.query(`INSERT INTO users (email, date_of_birth) VALUES ($1, $2)`, [
      "dup@example.test",
      "1990-01-01",
    ]);

    await expect(
      pool.query(`INSERT INTO users (email, date_of_birth) VALUES ($1, $2)`, [
        "dup@example.test",
        "1991-01-01",
      ]),
    ).rejects.toThrow(/duplicate key/);
  });
});
