import { z } from "zod";

/** Mirrors `SelfExclusionPeriod` (`src/domain/compliance/limits.ts`). */
export const selfExcludeSchema = z
  .object({
    period: z.enum(["24H", "7D", "30D", "6M", "PERMANENT"]),
  })
  .strict();
