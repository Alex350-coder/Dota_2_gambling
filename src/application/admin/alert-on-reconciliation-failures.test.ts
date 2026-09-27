import { describe, expect, test } from "vitest";
import type {
  AlertInput,
  AlertNotifier,
  CreateRiskAlertInput,
  RiskAlertRepository,
} from "@/domain/ports";
import { alertOnReconciliationFailures } from "./alert-on-reconciliation-failures";

function testDeps() {
  const notified: AlertInput[] = [];
  const created: CreateRiskAlertInput[] = [];
  const notifier: AlertNotifier = {
    notify: (alert) => {
      notified.push(alert);
      return Promise.resolve();
    },
  };
  const repo: Partial<RiskAlertRepository> = {
    create: (input) => {
      created.push(input);
      return Promise.resolve({
        ...input,
        status: "OPEN",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      });
    },
  };
  return {
    notified,
    created,
    deps: {
      notifier,
      riskAlerts: () => repo as RiskAlertRepository,
      ids: { next: () => "alert-1" },
      clock: { now: () => new Date("2026-01-01T00:00:00Z") },
    },
  };
}

describe("alertOnReconciliationFailures", () => {
  test("sends one P1 notification and one CRITICAL risk_alerts row per FAILED invariant, none for PASS", async () => {
    const { notified, created, deps } = testDeps();

    await alertOnReconciliationFailures(
      undefined,
      [
        { id: "INV-01", status: "PASS", detail: "ok" },
        { id: "INV-03", status: "FAIL", detail: "wallet desynced" },
        { id: "INV-06", status: "FAIL", detail: "escrow desynced" },
      ],
      deps,
    );

    expect(notified).toHaveLength(2);
    expect(notified.every((a) => a.severity === "P1")).toBe(true);
    expect(created).toHaveLength(2);
    expect(created.every((a) => a.severity === "CRITICAL")).toBe(true);
  });

  test("classifies impossible-sequence invariants as R-12, everything else as R-11", async () => {
    const { created, deps } = testDeps();

    await alertOnReconciliationFailures(
      undefined,
      [
        { id: "INV-05", status: "FAIL", detail: "negative balance" },
        { id: "INV-01", status: "FAIL", detail: "ledger sum nonzero" },
      ],
      deps,
    );

    const byInvariant = new Map(created.map((a) => [a.entityId, a.ruleId]));
    expect(byInvariant.get("INV-05")).toBe("R-12");
    expect(byInvariant.get("INV-01")).toBe("R-11");
  });

  test("sends nothing when every invariant passes", async () => {
    const { notified, created, deps } = testDeps();

    await alertOnReconciliationFailures(
      undefined,
      [{ id: "INV-01", status: "PASS", detail: "ok" }],
      deps,
    );

    expect(notified).toHaveLength(0);
    expect(created).toHaveLength(0);
  });
});
