import { describe, expect, test } from "vitest";
import type { AdminDashboardReader, RiskAlertRepository } from "@/domain/ports";
import { GetAdminDashboardUseCase } from "./get-dashboard";

describe("GetAdminDashboardUseCase", () => {
  test("composes ledger-derived figures and the open risk-alert count", async () => {
    const dashboard: AdminDashboardReader = {
      getSummary: () =>
        Promise.resolve({
          openMarketCount: 3,
          totalEscrowMinor: 1_250_000n,
          pendingSettlementRunCount: 1,
          failedSettlementRunCount: 2,
        }),
    };
    const riskAlerts: Partial<RiskAlertRepository> = {
      countOpen: () => Promise.resolve(5),
    };

    const useCase = new GetAdminDashboardUseCase({
      uow: { run: (fn) => fn(undefined) },
      dashboard: () => dashboard,
      riskAlerts: () => riskAlerts as RiskAlertRepository,
    });

    const result = await useCase.execute();

    expect(result).toEqual({
      openMarketCount: 3,
      totalEscrowMinor: "1250000",
      pendingSettlementRunCount: 1,
      failedSettlementRunCount: 2,
      openRiskAlertCount: 5,
    });
  });

  test('renders zero escrow as the string "0", never an empty or missing field', async () => {
    const dashboard: AdminDashboardReader = {
      getSummary: () =>
        Promise.resolve({
          openMarketCount: 0,
          totalEscrowMinor: 0n,
          pendingSettlementRunCount: 0,
          failedSettlementRunCount: 0,
        }),
    };
    const riskAlerts: Partial<RiskAlertRepository> = { countOpen: () => Promise.resolve(0) };

    const useCase = new GetAdminDashboardUseCase({
      uow: { run: (fn) => fn(undefined) },
      dashboard: () => dashboard,
      riskAlerts: () => riskAlerts as RiskAlertRepository,
    });

    const result = await useCase.execute();
    expect(result.totalEscrowMinor).toBe("0");
  });
});
