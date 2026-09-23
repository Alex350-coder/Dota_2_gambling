import { describe, expect, test } from "vitest";
import type { CreateRiskAlertInput, RiskAlertRepository, RiskSignalReader } from "@/domain/ports";
import {
  evaluateCloseWindowDispute,
  evaluateNewAccountFullBalanceBet,
  evaluateNewDeviceStake,
  evaluateOrderRateSpike,
  evaluateRepeatedCrossMatchPairing,
  evaluateSharedDeviceOppositeSides,
  evaluateStakeSpike,
} from "./rules";

/**
 * Unit-level: mocks `RiskSignalReader` to return canned signals, isolating each rule's
 * *decision logic* (threshold comparisons, payload shape, exactly-one-alert-per-hit) from the
 * SQL behind the port. SQL correctness against a real Postgres schema is proven separately by
 * tests/integration/application/risk/placement-rules-smoke.test.ts.
 */
function captureAlerts(): {
  readonly riskAlerts: (tx: undefined) => RiskAlertRepository;
  readonly created: CreateRiskAlertInput[];
} {
  const created: CreateRiskAlertInput[] = [];
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
  return { riskAlerts: () => repo as RiskAlertRepository, created };
}

const clock = { now: () => new Date("2026-01-01T00:00:00Z") };
const ids = { next: () => "alert-1" };

describe("evaluateSharedDeviceOppositeSides (R-03)", () => {
  test("fires when another account shares a device and bet the opposite outcome", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      findSharedDeviceOppositeSideMatch: () =>
        Promise.resolve({ marketId: "m-1", otherUserId: "u-2", otherOrderId: "o-2" }),
    };

    await evaluateSharedDeviceOppositeSides(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ ruleId: "R-03", severity: "HIGH", entityId: "m-1" });
  });

  test("does not fire when no shared-device match exists", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      findSharedDeviceOppositeSideMatch: () => Promise.resolve(null),
    };

    await evaluateSharedDeviceOppositeSides(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });
});

describe("evaluateRepeatedCrossMatchPairing (R-04)", () => {
  test("fires once per pair that meets the repeated-market threshold", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      findRepeatedPairings: () =>
        Promise.resolve([{ otherUserId: "u-2", marketCount: 3, marketIds: ["m-1", "m-2", "m-3"] }]),
    };

    await evaluateRepeatedCrossMatchPairing(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(1);
    expect(created[0]?.ruleId).toBe("R-04");
    expect(created[0]?.entityId).toBe("u-2");
  });

  test("does not fire when no pair meets the threshold", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      findRepeatedPairings: () => Promise.resolve([]),
    };

    await evaluateRepeatedCrossMatchPairing(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });
});

describe("evaluateOrderRateSpike (R-05)", () => {
  test("fires when the order count exceeds the per-minute threshold", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getOrderRateLastMinute: () => Promise.resolve({ userId: "u-1", recentCount: 6 }),
    };

    await evaluateOrderRateSpike(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ ruleId: "R-05", severity: "MEDIUM", entityId: "u-1" });
  });

  test("does not fire at or below the threshold", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getOrderRateLastMinute: () => Promise.resolve({ userId: "u-1", recentCount: 5 }),
    };

    await evaluateOrderRateSpike(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });
});

describe("evaluateStakeSpike (R-06)", () => {
  test("fires when the stake exceeds the multiple of the 30-day median", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getStakeSpikeSignal: () =>
        Promise.resolve({
          userId: "u-1",
          requestedMinor: "60000",
          medianMinor: "10000",
          priorCount: 5,
        }),
    };

    await evaluateStakeSpike(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(1);
    expect(created[0]?.ruleId).toBe("R-06");
  });

  test("does not fire with too little order history", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getStakeSpikeSignal: () =>
        Promise.resolve({
          userId: "u-1",
          requestedMinor: "60000",
          medianMinor: "10000",
          priorCount: 1,
        }),
    };

    await evaluateStakeSpike(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });

  test("does not fire when the stake is within the normal multiple", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getStakeSpikeSignal: () =>
        Promise.resolve({
          userId: "u-1",
          requestedMinor: "20000",
          medianMinor: "10000",
          priorCount: 5,
        }),
    };

    await evaluateStakeSpike(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });
});

describe("evaluateNewAccountFullBalanceBet (R-08)", () => {
  test("fires for a brand-new account betting nearly its whole balance", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getNewAccountBalanceSignal: () =>
        Promise.resolve({
          userId: "u-1",
          requestedMinor: "95000",
          availableMinor: "5000",
          accountAgeMinutes: 5,
        }),
    };

    await evaluateNewAccountFullBalanceBet(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(1);
    expect(created[0]?.ruleId).toBe("R-08");
  });

  test("does not fire once the account is older than the window", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getNewAccountBalanceSignal: () =>
        Promise.resolve({
          userId: "u-1",
          requestedMinor: "95000",
          availableMinor: "5000",
          accountAgeMinutes: 60,
        }),
    };

    await evaluateNewAccountFullBalanceBet(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });

  test("does not fire when the stake is a small fraction of the balance", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getNewAccountBalanceSignal: () =>
        Promise.resolve({
          userId: "u-1",
          requestedMinor: "1000",
          availableMinor: "99000",
          accountAgeMinutes: 5,
        }),
    };

    await evaluateNewAccountFullBalanceBet(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });
});

describe("evaluateNewDeviceStake (R-09)", () => {
  test("fires for a first-seen ip_hash within the window", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getNewDeviceSignal: () =>
        Promise.resolve({
          userId: "u-1",
          sessionId: "s-1",
          ipHash: "hash-1",
          sessionAgeMinutes: 2,
          priorSightings: 0,
        }),
    };

    await evaluateNewDeviceStake(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(1);
    expect(created[0]?.ruleId).toBe("R-09");
  });

  test("does not fire when the device has been seen before", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getNewDeviceSignal: () =>
        Promise.resolve({
          userId: "u-1",
          sessionId: "s-1",
          ipHash: "hash-1",
          sessionAgeMinutes: 2,
          priorSightings: 1,
        }),
    };

    await evaluateNewDeviceStake(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "o-1",
    );

    expect(created).toHaveLength(0);
  });
});

describe("evaluateCloseWindowDispute (R-07)", () => {
  test("fires when orders were placed within the close window on a disputed market", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getCloseWindowOrderCount: () => Promise.resolve({ orderCount: 2 }),
    };

    await evaluateCloseWindowDispute(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "m-1",
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ ruleId: "R-07", severity: "HIGH", entityId: "m-1" });
  });

  test("does not fire when no orders were placed in the close window", async () => {
    const { riskAlerts, created } = captureAlerts();
    const riskSignals: Partial<RiskSignalReader> = {
      getCloseWindowOrderCount: () => Promise.resolve({ orderCount: 0 }),
    };

    await evaluateCloseWindowDispute(
      undefined,
      { riskSignals: () => riskSignals as RiskSignalReader, riskAlerts, ids, clock },
      "m-1",
    );

    expect(created).toHaveLength(0);
  });
});
