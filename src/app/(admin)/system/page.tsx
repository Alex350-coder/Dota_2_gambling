import { getContainer } from "@/platform/http/container";
import { runAllReconcileChecks } from "@/infra/db/reconcile-queries";
import { alertOnReconciliationFailures } from "@/application/admin";

/**
 * T-908 — server-rendered directly against `runAllReconcileChecks` (same repeatable-read
 * transaction pattern as the route/CLI); no client-side fetch needed since this always reflects
 * the moment the page is requested.
 */
export default async function AdminSystemPage() {
  const container = getContainer();

  const health = await container.getSystemHealth.execute();

  const client = await container.pool.connect();
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

  const failures = results.filter((result) => result.status === "FAIL");
  await alertOnReconciliationFailures(results, container.alertNotifier);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">System</h1>
      <div>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">Health</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-[var(--text-secondary)]">Money mode</dt>
            <dd className="text-[var(--text-primary)]">{container.config.MONEY_MODE}</dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--text-secondary)]">Migration version</dt>
            <dd className="text-[var(--text-primary)]">{health.migrationVersion ?? "unknown"}</dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--text-secondary)]">Job queue depth</dt>
            <dd className="text-[var(--text-primary)]">
              {health.pendingJobCount} pending
              {health.failedJobCount > 0 && (
                <span className="text-[var(--state-danger)]">
                  {" "}
                  · {health.failedJobCount} failed
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <div>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">Reconciliation</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Money mode:{" "}
          <span className="text-[var(--text-primary)]">{container.config.MONEY_MODE}</span>
          {" · "}
          {failures.length === 0 ? (
            <span className="text-[var(--state-success)]">
              all {results.length} invariants pass
            </span>
          ) : (
            <span className="text-[var(--state-danger)]">
              {failures.length} invariant{failures.length === 1 ? "" : "s"} FAILING
            </span>
          )}
        </p>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
              <th className="py-2">Invariant</th>
              <th className="py-2">Status</th>
              <th className="py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.id} className="border-b border-[var(--border-default)]">
                <td className="py-2 text-[var(--text-primary)]">{result.id}</td>
                <td
                  className={
                    result.status === "PASS"
                      ? "py-2 text-[var(--state-success)]"
                      : "py-2 text-[var(--state-danger)]"
                  }
                >
                  {result.status}
                </td>
                <td className="py-2 text-[var(--text-secondary)]">{result.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
