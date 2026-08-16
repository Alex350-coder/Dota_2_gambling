import { DomainError } from "../errors";
import { add } from "../money/arith";
import { assertValidBps } from "../money/bps";
import type { Minor } from "../money/types";

/**
 * Stored BetOrder states (StateManagement.md §3). PARTIALLY_MATCHED is a
 * UI-only projection (matched > 0 && unmatched > 0), never a stored value.
 */
export type BetOrderStatus =
  "PENDING" | "OPEN" | "MATCHED" | "CANCELLED" | "SETTLED" | "VOIDED" | "REJECTED";

/** See Claude/domain/BETTING_ENGINE.md §4. */
export interface BetOrder {
  readonly id: string;
  readonly userId: string;
  readonly marketId: string;
  readonly outcomeId: string;
  readonly requestedMinor: Minor;
  readonly matchedMinor: Minor;
  readonly unmatchedMinor: Minor;
  readonly releasedMinor: Minor;
  readonly oddsNum: number;
  readonly oddsDen: number;
  readonly commissionBps: number;
  readonly status: BetOrderStatus;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type BetOrderInput = BetOrder;

function assertValidInvariants(order: BetOrder): void {
  if (order.matchedMinor > order.requestedMinor) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "matchedMinor must not exceed requestedMinor (RULE-B01)",
      {
        details: {
          matchedMinor: order.matchedMinor.toString(),
          requestedMinor: order.requestedMinor.toString(),
        },
      },
    );
  }

  const sum = add(add(order.matchedMinor, order.unmatchedMinor), order.releasedMinor);
  if (sum !== order.requestedMinor) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "requestedMinor must equal matchedMinor + unmatchedMinor + releasedMinor (RULE-B02)",
      { details: { requestedMinor: order.requestedMinor.toString(), sum: sum.toString() } },
    );
  }
}

function assertValidOdds(oddsNum: number, oddsDen: number): void {
  if (!Number.isInteger(oddsNum) || oddsNum <= 0) {
    throw new RangeError("oddsNum must be a positive integer");
  }
  if (!Number.isInteger(oddsDen) || oddsDen <= 0) {
    throw new RangeError("oddsDen must be a positive integer");
  }
}

export function createBetOrder(input: BetOrderInput): BetOrder {
  assertValidOdds(input.oddsNum, input.oddsDen);
  assertValidBps(input.commissionBps);
  assertValidInvariants(input);

  return { ...input };
}
