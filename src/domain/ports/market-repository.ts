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

export interface CreateMarketInput {
  readonly id: string;
  readonly matchId: string;
  readonly marketTypeId: string;
  readonly streamerId: string;
  readonly economicProfileId: string;
  readonly closesAt: Date;
}

/** `markets` has no owner — a plain finder, unlike the owner-scoped repositories. */
export interface MarketRepository {
  create(input: CreateMarketInput): Promise<Market>;
  findById(id: string): Promise<Market | null>;
  list(): Promise<Market[]>;
  findByMatchId(matchId: string): Promise<Market[]>;
  updateStatus(id: string, status: MarketStatus): Promise<Market>;
  /** OPEN markets whose `closesAt` is at or before `now` — feeds the close scheduler (T-408). */
  findOpenPastClosesAt(now: Date): Promise<Market[]>;
}
