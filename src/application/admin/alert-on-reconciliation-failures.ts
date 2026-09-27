import type { AlertNotifier, Clock, IdGenerator, RiskAlertRepository } from "@/domain/ports";

export interface ReconcileResultLike {
  readonly id: string;
  readonly status: "PASS" | "FAIL";
  readonly detail: string;
}

/**
 * FRAUD_PREVENTION.md §3, R-12: "Impossible sequence (settlement before result confirmation,
 * allocation without escrow, negative balance attempt)" — the invariants that detect exactly
 * those conditions. INV-05 catches a negative available/locked balance directly; INV-06/INV-07
 * catch escrow diverging from active allocations (an allocation existing without matching
 * escrow, or escrow surviving past SETTLED/VOID); INV-14/INV-15 catch a settlement or
 * idempotency sequence that should be structurally impossible (duplicate SETTLE_PAYOUT
 * transactions, duplicate idempotency keys). Every other invariant is classified R-11 (general
 * reconciliation drift) below.
 */
const R12_IMPOSSIBLE_SEQUENCE_INVARIANTS = new Set([
  "INV-05",
  "INV-06",
  "INV-07",
  "INV-14",
  "INV-15",
]);

export interface AlertOnReconciliationFailuresDeps<Tx> {
  readonly notifier: AlertNotifier;
  readonly riskAlerts: (tx: Tx) => RiskAlertRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * T-912/T-915 — OBSERVABILITY.md §5: "Reconciliation failure | any INV violation | P1 | Freeze
 * settlements, incident procedure." Every FAILED invariant fires one P1 alert (T-912) and
 * writes one CRITICAL `risk_alerts` row classified as R-11 (general drift) or R-12 (impossible
 * sequence, per the set above) (T-915). This is evaluation only — it never blocks the caller,
 * the admin route/page still returns the results either way; an actual settlement-blocking
 * freeze mechanism is not implemented in this phase (a follow-up, noted in the phase completion
 * report) since wiring it into `SettleMarketUseCase`/the sweeper would touch already-exhaustively
 * -tested P6 financial code, and this phase prioritises not destabilising it over completeness
 * of a freeze feature.
 */
export async function alertOnReconciliationFailures<Tx>(
  tx: Tx,
  results: readonly ReconcileResultLike[],
  deps: AlertOnReconciliationFailuresDeps<Tx>,
): Promise<void> {
  const failures = results.filter((result) => result.status === "FAIL");
  const riskAlerts = deps.riskAlerts(tx);

  await Promise.all(
    failures.map(async (failure) => {
      await deps.notifier.notify({
        severity: "P1",
        code: "RECONCILIATION_FAILURE",
        message: `reconciliation invariant ${failure.id} failed`,
        details: { invariantId: failure.id, detail: failure.detail },
      });

      const ruleId = R12_IMPOSSIBLE_SEQUENCE_INVARIANTS.has(failure.id) ? "R-12" : "R-11";
      await riskAlerts.create({
        id: deps.ids.next(),
        ruleId,
        severity: "CRITICAL",
        entityType: "reconciliation",
        entityId: failure.id,
        payload: { invariantId: failure.id, detail: failure.detail },
        createdAt: deps.clock.now(),
      });
    }),
  );
}
