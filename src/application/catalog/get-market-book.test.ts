import { describe, expect, test } from "vitest";
import { DomainError } from "@/domain/errors";
import type {
  BookRepository,
  Market,
  MarketRepository,
  Outcome,
  OutcomeRepository,
} from "@/domain/ports";
import { GetMarketBookUseCase } from "./get-market-book";

function bookFixture(unmatchedByOutcome: ReadonlyMap<string, bigint> = new Map()): BookRepository {
  return {
    findRestingOrders: () => Promise.reject(new Error("not used")),
    findOpenOrdersByMarket: () => Promise.reject(new Error("not used")),
    findAllByMarketId: () => Promise.reject(new Error("not used")),
    sumUnmatchedByOutcome: () => Promise.resolve(unmatchedByOutcome),
  };
}

function marketFixture(overrides: Partial<Market> = {}): Market {
  return {
    id: "market-1",
    matchId: "match-1",
    marketTypeId: "market-type-1",
    streamerId: "streamer-1",
    economicProfileId: "profile-1",
    status: "OPEN",
    closesAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2025-12-01T00:00:00Z"),
    updatedAt: new Date("2025-12-01T00:00:00Z"),
    ...overrides,
  };
}

function outcomeFixture(overrides: Partial<Outcome> = {}): Outcome {
  return {
    id: "outcome-1",
    marketId: "market-1",
    code: "RADIANT",
    label: "Radiant",
    createdAt: new Date("2025-12-01T00:00:00Z"),
    ...overrides,
  };
}

describe("GetMarketBookUseCase", () => {
  test("returns aggregate-only per-outcome liquidity with no counterparty data", async () => {
    const market = marketFixture();
    const outcomes = [
      outcomeFixture(),
      outcomeFixture({ id: "outcome-2", code: "DIRE", label: "Dire" }),
    ];

    const markets: MarketRepository = {
      create: () => Promise.reject(new Error("not used")),
      findById: () => Promise.resolve(market),
      list: () => Promise.resolve([market]),
      findByMatchId: () => Promise.resolve([market]),
      updateStatus: () => Promise.reject(new Error("not used")),
      findOpenPastClosesAt: () => Promise.resolve([]),
    };
    const outcomeRepo: OutcomeRepository = {
      create: () => Promise.reject(new Error("not used")),
      listByMarketId: () => Promise.resolve(outcomes),
    };

    const useCase = new GetMarketBookUseCase<undefined>({
      uow: { run: (fn) => fn(undefined) },
      markets: () => markets,
      outcomes: () => outcomeRepo,
      book: () => bookFixture(new Map([["outcome-1", 7_000n]])),
    });

    const book = await useCase.execute({ marketId: "market-1" });

    expect(book.marketId).toBe("market-1");
    expect(book.outcomes).toHaveLength(2);
    for (const outcome of book.outcomes) {
      expect(outcome).not.toHaveProperty("userId");
      expect(outcome).not.toHaveProperty("orderId");
      expect(outcome).not.toHaveProperty("counterparty");
      expect(typeof outcome.unmatchedStake).toBe("string");
    }
    // Regression test: the real per-outcome aggregate must reach the response, not a
    // hardcoded placeholder — this outcome has open unmatched liquidity, the other doesn't.
    expect(book.outcomes.find((o) => o.outcomeId === "outcome-1")?.unmatchedStake).toBe("7000");
    expect(book.outcomes.find((o) => o.outcomeId === "outcome-2")?.unmatchedStake).toBe("0");
  });

  test("throws RESOURCE_NOT_FOUND when the market does not exist", async () => {
    const markets: MarketRepository = {
      create: () => Promise.reject(new Error("not used")),
      findById: () => Promise.resolve(null),
      list: () => Promise.resolve([]),
      findByMatchId: () => Promise.resolve([]),
      updateStatus: () => Promise.reject(new Error("not used")),
      findOpenPastClosesAt: () => Promise.resolve([]),
    };
    const outcomeRepo: OutcomeRepository = {
      create: () => Promise.reject(new Error("not used")),
      listByMarketId: () => Promise.resolve([]),
    };

    const useCase = new GetMarketBookUseCase<undefined>({
      uow: { run: (fn) => fn(undefined) },
      markets: () => markets,
      outcomes: () => outcomeRepo,
      book: () => bookFixture(),
    });

    await expect(useCase.execute({ marketId: "missing" })).rejects.toThrow(DomainError);
  });
});
