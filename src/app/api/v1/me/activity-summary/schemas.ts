import { z } from "zod";

/** Mirrors `ActivitySummaryPeriod` (`RollingLimitPeriod | "ALL"`). */
export const activitySummaryQuerySchema = z
  .object({
    period: z.enum(["DAY", "WEEK", "MONTH", "ALL"]).optional(),
    currency: z.string().length(3).optional(),
  })
  .strict();
