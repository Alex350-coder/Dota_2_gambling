import { describe, expect, test } from "vitest";
import type { AlertInput, AlertNotifier } from "@/domain/ports";
import { alertOnReconciliationFailures } from "./alert-on-reconciliation-failures";

describe("alertOnReconciliationFailures", () => {
  test("sends exactly one P1 alert per FAILED invariant, none for PASS", async () => {
    const notified: AlertInput[] = [];
    const notifier: AlertNotifier = {
      notify: (alert) => {
        notified.push(alert);
        return Promise.resolve();
      },
    };

    await alertOnReconciliationFailures(
      [
        { id: "INV-01", status: "PASS", detail: "ok" },
        { id: "INV-03", status: "FAIL", detail: "wallet desynced" },
        { id: "INV-06", status: "FAIL", detail: "escrow desynced" },
      ],
      notifier,
    );

    expect(notified).toHaveLength(2);
    expect(notified.every((a) => a.severity === "P1")).toBe(true);
    expect(notified.map((a) => a.details?.invariantId).sort()).toEqual(["INV-03", "INV-06"]);
  });

  test("sends no alert when every invariant passes", async () => {
    const notified: AlertInput[] = [];
    const notifier: AlertNotifier = {
      notify: (alert) => {
        notified.push(alert);
        return Promise.resolve();
      },
    };

    await alertOnReconciliationFailures([{ id: "INV-01", status: "PASS", detail: "ok" }], notifier);

    expect(notified).toHaveLength(0);
  });
});
