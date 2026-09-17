import type { LimitKind, RgLimitState } from "@/domain/compliance";

/**
 * Scoped to a single owner at construction time — every implementation must filter
 * `WHERE user_id = $ownerId` at the SQL level, never only in application code.
 */
export interface RgLimitRepository {
  /**
   * Every limit row the owner has set for `kind` (one row per distinct period the owner has
   * configured — e.g. a STAKE limit can have DAY, WEEK, and MONTH rows simultaneously, all
   * enforced together).
   */
  listByKind(kind: LimitKind): Promise<RgLimitState[]>;
}
