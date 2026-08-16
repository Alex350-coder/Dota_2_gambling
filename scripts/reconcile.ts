import { writeFile } from "node:fs/promises";
import { createPool } from "@/infra/db/client";
import { runAllReconcileChecks } from "@/infra/db/reconcile-queries";
import { loadConfig } from "@/platform/config";

interface ReconcileReport {
  readonly generatedAt: string;
  readonly moneyMode: string;
  readonly results: readonly { id: string; status: "PASS" | "FAIL"; detail: string }[];
}

function parseReportPath(argv: readonly string[]): string | undefined {
  const flagIndex = argv.indexOf("--report");
  if (flagIndex === -1) return undefined;
  return argv[flagIndex + 1];
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    const client = await pool.connect();
    let results;
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      results = await runAllReconcileChecks(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const report: ReconcileReport = {
      generatedAt: new Date().toISOString(),
      moneyMode: config.MONEY_MODE,
      results,
    };

    const reportPath = parseReportPath(process.argv.slice(2));
    if (reportPath) {
      await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    const failures = results.filter((result) => result.status === "FAIL");
    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(`${failure.id} FAILED: ${failure.detail}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(`reconcile: all ${results.length} invariants passed (MET-FIN-01 = 0)`);
  } finally {
    await pool.end();
  }
}

void main();
