import { z } from "zod";

/** .strict() everywhere (Validation.md): unknown query params get a 422, not a silent ignore. */
export const pageQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid() });
