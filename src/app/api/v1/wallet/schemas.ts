import { z } from "zod";

export const simulatedCreditSchema = z
  .object({
    currency: z.string().length(3),
    amountMinor: z.string().regex(/^[1-9]\d*$/),
  })
  .strict();
