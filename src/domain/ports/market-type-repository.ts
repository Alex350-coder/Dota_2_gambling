import type { MarketType } from "../catalog/market-type";

/** `market_types` is an ownerless catalog entity — a plain finder, no ownership scoping. */
export interface MarketTypeRepository {
  create(input: MarketType): Promise<MarketType>;
  findByCode(code: string): Promise<MarketType | null>;
  list(): Promise<MarketType[]>;
}
