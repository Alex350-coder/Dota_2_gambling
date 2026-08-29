/**
 * node-postgres returns `numeric`/`int8` columns as strings, not native bigints, on raw
 * `pool.query()` results (unlike Drizzle's schema-typed queries, which convert via their
 * `bigint("...", { mode: "bigint" })` column mode). Casting with `as { col: bigint }` only
 * affects the type checker, not the runtime value — comparing that string against a bigint
 * literal in `expect(...).toBe(...)` always fails. Use this to actually convert.
 */
export function toBigIntRow<T extends Record<string, unknown>, K extends keyof T>(
  row: T,
  bigintKeys: readonly K[],
): T {
  const result = { ...row };
  for (const key of bigintKeys) {
    result[key] = BigInt(result[key] as string) as T[K];
  }
  return result;
}
