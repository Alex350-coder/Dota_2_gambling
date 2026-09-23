import type { AlertNotifier } from "@/domain/ports";

export interface ReconcileResultLike {
  readonly id: string;
  readonly status: "PASS" | "FAIL";
  readonly detail: string;
}

/**
 * T-912 — OBSERVABILITY.md §5: "Reconciliation failure | any INV violation | P1 | Freeze
 * settlements, incident procedure." Every FAILED invariant fires exactly one P1 alert; this is
 * evaluation only (never blocks the caller — the admin route/page still returns the results
 * either way), the actual settlement freeze is R-11's job (T-915).
 */
export async function alertOnReconciliationFailures(
  results: readonly ReconcileResultLike[],
  notifier: AlertNotifier,
): Promise<void> {
  const failures = results.filter((result) => result.status === "FAIL");
  await Promise.all(
    failures.map((failure) =>
      notifier.notify({
        severity: "P1",
        code: "RECONCILIATION_FAILURE",
        message: `reconciliation invariant ${failure.id} failed`,
        details: { invariantId: failure.id, detail: failure.detail },
      }),
    ),
  );
}
