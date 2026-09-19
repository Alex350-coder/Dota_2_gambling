import { z } from "zod";

export const simulatedCreditSchema = z
  .object({
    currency: z.string().length(3),
    amountMinor: z.string().regex(/^[1-9]\d*$/),
  })
  .strict();

/** `currency` is optional — defaults to `config.CURRENCY` in the route handler, since the
 * platform is effectively single-currency today (Routes.md's `GET /wallet` takes no params). */
export const getWalletQuerySchema = z
  .object({
    currency: z.string().length(3).optional(),
  })
  .strict();
