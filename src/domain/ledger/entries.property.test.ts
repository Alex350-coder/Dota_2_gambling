import { describe, it } from "vitest";
import fc from "fast-check";
import { createLedgerTransaction, type LedgerEntryInput } from "./entries";

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

/** A random balanced entry set: N-1 random legs plus one closing leg that forces the sum to 0. */
const balancedEntriesArb = fc
  .array(
    fc.record({
      accountKey: fc.constantFrom("USER_AVAILABLE:a", "USER_LOCKED:a", "MARKET_ESCROW:m"),
      signedAmountMinor: fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
    }),
    { minLength: 1, maxLength: 4 },
  )
  .map((legs) => {
    const closing = legs.reduce((sum, leg) => sum - leg.signedAmountMinor, 0n);
    return [...legs, { accountKey: "USER_AVAILABLE:closing", signedAmountMinor: closing }];
  })
  .filter((entries) => entries.every((entry) => entry.signedAmountMinor !== 0n));

/** A random lifecycle: a sequence of independently-balanced transactions. */
const lifecycleArb = fc.array(balancedEntriesArb, { minLength: 1, maxLength: 20 });

describe("property: a random lifecycle of transactions keeps the global ledger sum at zero (PROP-03)", () => {
  it("SUM(signed_amount_minor) across every entry ever posted stays 0 after each step", () => {
    fc.assert(
      fc.property(lifecycleArb, (lifecycle) => {
        let globalSum = 0n;
        let entryCounter = 0;

        for (const legs of lifecycle) {
          const counter = String(entryCounter);
          const entries: LedgerEntryInput[] = legs.map((leg, index) => ({
            id: `entry-${counter}-${String(index)}`,
            accountKey: leg.accountKey,
            currency: "PEN",
            signedAmountMinor: leg.signedAmountMinor,
          }));
          entryCounter += 1;

          const txn = createLedgerTransaction({
            id: `txn-${counter}`,
            kind: "ADJUSTMENT",
            referenceType: "market",
            referenceId: "m-1",
            idempotencyKey: `idem-${counter}`,
            actorType: "SYSTEM",
            actorId: undefined,
            createdAt: FIXED_DATE,
            entries,
          });

          for (const entry of txn.entries) {
            globalSum += entry.signedAmountMinor;
          }

          // INV-01: the ledger is globally balanced after every single transaction, not just
          // at the end of the lifecycle — money never transiently exists or vanishes.
          if (globalSum !== 0n) return false;
        }

        return true;
      }),
      { numRuns: 2_000, seed: 42 },
    );
  });
});
