import type { LedgerPostEntry } from "@/domain/ports";
import { negate, type Minor } from "@/domain/money";

export interface CommissionLegInput {
  readonly marketId: string;
  readonly streamerId: string;
  readonly currency: string;
  readonly commissionMinor: Minor;
}

/**
 * Streamer commission is a liability, not a wallet — it is credited to
 * `STREAMER_PAYABLE:<streamerId>`, an account `LedgerService.applyWalletDeltas` does not
 * recognise (only `USER_AVAILABLE:*`/`USER_LOCKED:*` project onto `wallets`), so this money
 * structurally can never land in a spendable wallet without a separate, explicit conversion
 * operation (SETTLEMENT.md §7, T-614). The matching debit leg lives on `MARKET_ESCROW` so the
 * pair can be folded into the same balanced transaction as the winner's payout leg under one
 * `settle:<allocationId>` idempotency key (SETTLEMENT.md §5) rather than a second ledger post.
 *
 * Returns no entries when `commissionMinor` is zero — a market with no associated streamer
 * configures `commissionBps = 0` on its allocations, and zero-amount legs are omitted, never
 * written as zero rows (SETTLEMENT.md §4, `chk_ledger_entries_nonzero`).
 */
export function commissionLedgerEntries(input: CommissionLegInput): readonly LedgerPostEntry[] {
  if (input.commissionMinor === 0n) {
    return [];
  }

  return [
    {
      accountKey: `MARKET_ESCROW:${input.marketId}`,
      currency: input.currency,
      signedAmountMinor: negate(input.commissionMinor),
    },
    {
      accountKey: `STREAMER_PAYABLE:${input.streamerId}`,
      currency: input.currency,
      signedAmountMinor: input.commissionMinor,
    },
  ];
}
