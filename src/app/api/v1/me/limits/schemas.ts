import { z } from "zod";

/** Mirrors `LimitKind`/`LimitPeriod` (`src/domain/compliance/limits.ts`) — `assertValidLimitPeriod`
 * in the use case still validates the `(kind, period)` pairing itself. */
export const updateLimitSchema = z
  .object({
    kind: z.enum(["DEPOSIT", "STAKE", "LOSS", "SESSION_TIME", "SINGLE_BET"]),
    period: z.enum(["DAY", "WEEK", "MONTH", "SESSION", "PER_BET"]),
    value: z.string().regex(/^\d+$/),
  })
  .strict();
