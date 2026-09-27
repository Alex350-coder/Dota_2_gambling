import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

/**
 * Node-native (no shell-script dependency, so it runs the same on the CI Linux runner as on a
 * Windows dev machine) equivalent of `scripts/restore.sh`'s backup/restore steps, for use inside
 * DR drill tests (T-1004). See `scripts/restore.sh` for the documented, operator-facing version
 * of the same procedure and its logical-restore limitation note.
 */

export async function dumpDatabase(
  sourceUrl: string,
): Promise<{ dumpPath: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "dota2-dr-drill-"));
  const dumpPath = path.join(dir, "dump.custom");
  await execFileAsync("pg_dump", ["--format=custom", "--file", dumpPath, sourceUrl]);
  return { dumpPath, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/**
 * pg_restore returns a non-zero exit code even for a harmless "errors ignored" warning (e.g. a
 * dump taken by a newer pg_dump against an older target server emitting an unrecognised-
 * parameter notice for a session-level SET it cannot apply) — see `scripts/restore.sh`'s comment
 * for the same caveat. Correctness here is verified by the caller re-querying the restored
 * database, not by this function's own success — so a non-zero exit is tolerated and returned,
 * never thrown.
 */
export async function restoreDatabase(
  dumpPath: string,
  targetUrl: string,
): Promise<{ exitCode: number }> {
  try {
    await execFileAsync("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--dbname",
      targetUrl,
      dumpPath,
    ]);
    return { exitCode: 0 };
  } catch (error) {
    const exitCode = (error as { code?: number }).code ?? 1;
    return { exitCode };
  }
}

export async function createDrillDatabase(adminUrl: string, dbName: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);
    await client.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
  } finally {
    await client.end();
  }
}

export async function dropDrillDatabase(adminUrl: string, dbName: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);
  } finally {
    await client.end();
  }
}

/** DB identifiers here are always test-fixture-generated (`dr-drill-<uuid>`), never user input. */
function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function withDbName(databaseUrl: string, dbName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

export function adminUrl(databaseUrl: string): string {
  return withDbName(databaseUrl, "postgres");
}
