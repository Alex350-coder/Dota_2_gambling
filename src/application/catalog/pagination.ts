/** Hard cap on list-endpoint page size (RULE-G04) — applies to every public catalog list. */
export const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export interface PageInput {
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

/**
 * In-memory pagination over a full entity list. Catalog tables (games, matches,
 * markets, streamers) are small enough that repository-level `list()` plus
 * slicing here is an acceptable simplification over DB-level LIMIT/OFFSET.
 */
export function paginate<T>(all: readonly T[], input: PageInput): Page<T> {
  const page = input.page !== undefined && input.page > 0 ? Math.floor(input.page) : 1;
  const limit =
    input.limit !== undefined && input.limit > 0
      ? Math.min(Math.floor(input.limit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const start = (page - 1) * limit;
  return { items: all.slice(start, start + limit), total: all.length, page, limit };
}
