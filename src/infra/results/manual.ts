import type { MatchRef, MatchResultProvider, RawMatchResult } from "@/domain/ports";

/**
 * MVP result source (RESULT_PROVIDERS.md §4): an admin types the winning outcome directly,
 * no automated fetch. `fetchResult` always returns `null` — the propose use case builds the
 * `RawMatchResult` from the admin's request body itself rather than asking this adapter to
 * go get one — this class exists so the proposal flow has a single, documented `providerKey`/
 * `trustLevel` pair to stamp on every manually-entered `market_results` row, and so any future
 * automated provider (`OPENDOTA`/`PANDASCORE`, POST-MVP) plugs into the same port shape.
 * `trustLevel = SINGLE_SOURCE` per the MVP configuration table: settlement still requires an
 * explicit 4-eyes confirmation from a second admin before a `SINGLE_SOURCE` result can settle.
 */
export class ManualAdminResultProvider implements MatchResultProvider {
  readonly key = "MANUAL_ADMIN";
  readonly trustLevel = "SINGLE_SOURCE" as const;

  fetchResult(ref: MatchRef): Promise<RawMatchResult | null> {
    void ref;
    return Promise.resolve(null);
  }

  /** Manual admin entry works for any market type — there is no upstream feed to be missing. */
  supports(marketTypeKey: string): boolean {
    void marketTypeKey;
    return true;
  }
}
