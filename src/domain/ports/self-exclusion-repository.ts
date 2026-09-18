export interface SelfExclusionRecord {
  readonly id: string;
  readonly userId: string;
  readonly period: string;
  readonly startedAt: Date;
  readonly revocableAt: Date | null;
}

export interface CreateSelfExclusionInput {
  readonly id: string;
  readonly userId: string;
  readonly period: string;
  readonly startedAt: Date;
  readonly revocableAt: Date | null;
}

/** Append-only history of self-exclusion periods (`self_exclusions`, immutable via
 * `trg_self_exclusions_immutable`) — owner-scoped like `WalletRepository`/`RgLimitRepository`. */
export interface SelfExclusionRepository {
  create(input: CreateSelfExclusionInput): Promise<SelfExclusionRecord>;
  listByUserId(): Promise<SelfExclusionRecord[]>;
}
