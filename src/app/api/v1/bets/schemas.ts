import { z } from "zod";

/**
 * `currency` is accepted for API-contract parity with Routes.md but is not forwarded to
 * `PlaceOrderUseCase` — the use case already derives the market's true currency from its
 * economic profile and raises `CURRENCY_MISMATCH` off the caller's wallet, so re-validating a
 * client-declared value here would duplicate that check without adding safety. Odds are
 * server-derived from the market's economic profile and are never client-supplied.
 */
export const placeBetSchema = z
  .object({
    marketId: z.uuid(),
    outcomeId: z.uuid(),
    amountMinor: z.string().regex(/^[1-9]\d*$/),
    currency: z.string().length(3),
  })
  .strict();
