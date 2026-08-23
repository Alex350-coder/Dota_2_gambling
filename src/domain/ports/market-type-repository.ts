import type { MarketType } from "../catalog/market-type";

export interface PersistedMarketType extends MarketType {
  readonly id: string;
}

/** `market_types` is an ownerless catalog entity — a plain finder, no ownership scoping. */
export interface MarketTypeRepository {
  create(id: string, input: MarketType): Promise<PersistedMarketType>;
  findById(id: string): Promise<PersistedMarketType | null>;
  findByCode(code: string): Promise<PersistedMarketType | null>;
  list(): Promise<PersistedMarketType[]>;
}
