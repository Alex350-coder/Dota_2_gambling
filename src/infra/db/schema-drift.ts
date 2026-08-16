import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import * as schema from "@/infra/db/schema";

export interface DriftEntry {
  readonly table: string;
  readonly detail: string;
}

interface ExpectedColumn {
  readonly name: string;
  readonly notNull: boolean;
}

interface ExpectedTable {
  readonly tableName: string;
  readonly columns: readonly ExpectedColumn[];
}

function collectExpectedTables(): readonly ExpectedTable[] {
  const tables: ExpectedTable[] = [];

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) {
      continue;
    }

    const tableName = getTableName(value);
    const columns = getTableColumns(value);

    tables.push({
      tableName,
      columns: Object.values(columns).map((column) => {
        const c = column as { name: string; notNull: boolean };
        return { name: c.name, notNull: c.notNull };
      }),
    });
  }

  return tables;
}

/**
 * Compares the Drizzle schema (`src/infra/db/schema/**`) against the live columns of a
 * database migrated from `db/migrations/**`. Table/column presence and nullability drift
 * is reported; this is not a full DDL diff (types, constraints, indexes are covered by the
 * db/migrations tests instead), but it catches the classic drift failure mode: schema.ts and
 * the SQL migrations disagreeing about which columns exist.
 */
export async function findSchemaDrift(pool: Pool): Promise<readonly DriftEntry[]> {
  const expectedTables = collectExpectedTables();
  const drift: DriftEntry[] = [];

  for (const table of expectedTables) {
    const actualColumns = await pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table.tableName],
    );

    if (actualColumns.rowCount === 0) {
      drift.push({ table: table.tableName, detail: "table missing from migrated database" });
      continue;
    }

    const actualByName = new Map(
      actualColumns.rows.map((row) => [row.column_name, row.is_nullable === "YES"]),
    );

    for (const column of table.columns) {
      if (!actualByName.has(column.name)) {
        drift.push({
          table: table.tableName,
          detail: `column "${column.name}" missing from database`,
        });
        continue;
      }
      const actualNullable = actualByName.get(column.name);
      if (actualNullable === column.notNull) {
        drift.push({
          table: table.tableName,
          detail: `column "${column.name}" nullability mismatch: schema notNull=${String(column.notNull)}, database nullable=${String(actualNullable)}`,
        });
      }
    }

    const expectedNames = new Set(table.columns.map((column) => column.name));
    for (const actualName of actualByName.keys()) {
      if (!expectedNames.has(actualName)) {
        drift.push({
          table: table.tableName,
          detail: `column "${actualName}" present in database but not in schema`,
        });
      }
    }
  }

  return drift;
}
