import { z } from "zod";

const betOrderStatusSchema = z.enum([
  "PENDING",
  "OPEN",
  "MATCHED",
  "CANCELLED",
  "SETTLED",
  "VOIDED",
  "REJECTED",
]);

/** GET /bets query — pagination plus the status/market filters Routes.md documents. */
export const listBetsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).optional(),
    status: betOrderStatusSchema.optional(),
    marketId: z.uuid().optional(),
  })
  .strict();

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
