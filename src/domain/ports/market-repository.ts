import type { MarketStatus } from "../catalog/market-state";

export interface Market {
  readonly id: string;
  readonly matchId: string;
  readonly marketTypeId: string;
  readonly streamerId: string;
  readonly economicProfileId: string;
  readonly status: MarketStatus;
  readonly closesAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** `markets` has no owner — a plain finder, unlike the owner-scoped repositories. */
export interface MarketRepository {
  findById(id: string): Promise<Market | null>;
}
