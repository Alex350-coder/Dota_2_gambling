/**
 * Money is always an integer count of minor units (cents/centimos). Never a
 * float. See Claude/domain/WALLET_LEDGER.md §1 and RULE-B (Rules.md).
 */
export type Minor = bigint & { readonly __brand: "Minor" };

export function isMinor(value: unknown): value is Minor {
  return typeof value === "bigint" && value >= 0n;
}

export function toMinor(value: bigint): Minor {
  if (typeof value !== "bigint") {
    throw new TypeError("Minor amounts must be a bigint");
  }
  if (value < 0n) {
    throw new RangeError("Minor amounts must not be negative");
  }
  return value as Minor;
}

export const ZERO_MINOR: Minor = toMinor(0n);
