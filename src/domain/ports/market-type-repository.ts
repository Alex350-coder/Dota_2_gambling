import type { MarketType } from "../catalog/market-type";

export interface PersistedMarketType extends MarketType {
  readonly id: string;
}

/** `market_types` is an ownerless catalog entity — a plain finder, no ownership scoping. */
export interface MarketTypeRepository {
  create(id: string, input: MarketType): Promise<PersistedMarketType>;
  findByCode(code: string): Promise<PersistedMarketType | null>;
  list(): Promise<PersistedMarketType[]>;
}
