import { describe, expect, it } from "vitest";
import type { Clock, Market, MarketRepository } from "@/domain/ports";
import type { TransitionMarketInput, TransitionMarketUseCase } from "./transition-market";
import { CloseMarketsUseCase } from "./close-markets";

function marketFixture(id: string, overrides: Partial<Market> = {}): Market {
  return {
    id,
    matchId: "match-1",
    marketTypeId: "type-1",
    streamerId: "streamer-1",
    economicProfileId: "profile-1",
    status: "OPEN",
    closesAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    updatedAt: new Date("2025-12-01T00:00:00.000Z"),
    ...overrides,
  };
}

class FakeUnitOfWork {
  async run<T>(fn: (tx: undefined) => Promise<T> | T): Promise<T> {
    return fn(undefined);
  }
}

/** CloseMarketsUseCase's own sweep/isolation logic, exercised with fakes — the transition
 * itself (and its persistence) is already covered by real-Postgres integration tests. */
describe("CloseMarketsUseCase", () => {
  it("closes every expired OPEN market and returns their ids", async () => {
    const expired = [marketFixture("m1"), marketFixture("m2")];
    const closed: string[] = [];
    const useCase = new CloseMarketsUseCase<undefined>({
      uow: new FakeUnitOfWork(),
      markets: () =>
        ({ findOpenPastClosesAt: () => Promise.resolve(expired) }) as unknown as MarketRepository,
      transitionMarket: {
        execute: (input: TransitionMarketInput) => {
          closed.push(input.marketId);
          return Promise.resolve(marketFixture(input.marketId, { status: "CLOSED" }));
        },
      } as unknown as TransitionMarketUseCase<undefined>,
      clock: { now: () => new Date("2026-01-02T00:00:00.000Z") } satisfies Clock,
    });

    const result = await useCase.execute();

    expect(result.closedMarketIds).toEqual(["m1", "m2"]);
    expect(result.failedMarketIds).toEqual([]);
    expect(closed).toEqual(["m1", "m2"]);
  });

  it("isolates one failing market without blocking the rest of the sweep", async () => {
    const expired = [marketFixture("m1"), marketFixture("m2"), marketFixture("m3")];
    const useCase = new CloseMarketsUseCase<undefined>({
      uow: new FakeUnitOfWork(),
      markets: () =>
        ({ findOpenPastClosesAt: () => Promise.resolve(expired) }) as unknown as MarketRepository,
      transitionMarket: {
        execute: (input: TransitionMarketInput) => {
          if (input.marketId === "m2") {
            return Promise.reject(new Error("simulated transition failure"));
          }
          return Promise.resolve(marketFixture(input.marketId, { status: "CLOSED" }));
        },
      } as unknown as TransitionMarketUseCase<undefined>,
      clock: { now: () => new Date("2026-01-02T00:00:00.000Z") } satisfies Clock,
    });

    const result = await useCase.execute();

    expect(result.closedMarketIds).toEqual(["m1", "m3"]);
    expect(result.failedMarketIds).toEqual(["m2"]);
  });

  it("returns empty results when no market has passed closesAt", async () => {
    const useCase = new CloseMarketsUseCase<undefined>({
      uow: new FakeUnitOfWork(),
      markets: () =>
        ({ findOpenPastClosesAt: () => Promise.resolve([]) }) as unknown as MarketRepository,
      transitionMarket: {
        execute: () => Promise.resolve(marketFixture("unused")),
      } as unknown as TransitionMarketUseCase<undefined>,
      clock: { now: () => new Date("2026-01-02T00:00:00.000Z") } satisfies Clock,
    });

    const result = await useCase.execute();

    expect(result.closedMarketIds).toEqual([]);
    expect(result.failedMarketIds).toEqual([]);
  });
});
