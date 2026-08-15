import type { EconomicProfile } from "../catalog/economic-profile";

export interface EconomicModel {
  getProfile(marketId: string): Promise<EconomicProfile>;
}
