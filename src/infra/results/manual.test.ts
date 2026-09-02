import { describe, expect, it } from "vitest";
import { ManualAdminResultProvider } from "./manual";

describe("ManualAdminResultProvider", () => {
  it("identifies itself as MANUAL_ADMIN at SINGLE_SOURCE trust (RESULT_PROVIDERS.md §4 MVP config)", () => {
    const provider = new ManualAdminResultProvider();

    expect(provider.key).toBe("MANUAL_ADMIN");
    expect(provider.trustLevel).toBe("SINGLE_SOURCE");
  });

  it("supports every market type — there is no upstream feed to be missing", () => {
    const provider = new ManualAdminResultProvider();

    expect(provider.supports("MATCH_WINNER")).toBe(true);
    expect(provider.supports("ANY_ARBITRARY_MARKET_TYPE")).toBe(true);
  });

  it("never auto-fetches a result — the propose use case supplies the payload", async () => {
    const provider = new ManualAdminResultProvider();

    await expect(
      provider.fetchResult({ marketId: "market-1", matchId: "match-1" }),
    ).resolves.toBeNull();
  });
});
