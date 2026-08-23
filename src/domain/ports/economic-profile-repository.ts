export interface PersistedEconomicProfile {
  readonly id: string;
  readonly oddsNum: number;
  readonly oddsDen: number;
  readonly streamerCommissionBps: number;
  readonly platformFeeBps: number;
  readonly currency: string;
  readonly minStakeMinor: bigint;
  readonly maxStakeMinor: bigint;
  readonly createdAt: Date;
}

export interface CreateEconomicProfileInput {
  readonly id: string;
  readonly oddsNum: number;
  readonly oddsDen: number;
  readonly streamerCommissionBps: number;
  readonly platformFeeBps: number;
  readonly currency: string;
  readonly minStakeMinor: bigint;
  readonly maxStakeMinor: bigint;
}

/**
 * `economic_profiles` is append-only (RULE-F04) — no update/delete, matching the
 * app_role grant added in db/migrations/0014_market_type_cardinality_grants.sql.
 */
export interface EconomicProfileRepository {
  create(input: CreateEconomicProfileInput): Promise<PersistedEconomicProfile>;
  findById(id: string): Promise<PersistedEconomicProfile | null>;
  list(): Promise<PersistedEconomicProfile[]>;
}
