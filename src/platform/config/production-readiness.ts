import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * RULE-K01 / Claude/compliance/COMPLIANCE.md §3-4 (T-1009): `MONEY_MODE=REAL` may only boot
 * once every gate in this file is `satisfied: true`. Reading and checking this file is itself
 * the enforcement mechanism — a feature flag alone can never flip real money on, because this
 * check runs unconditionally at config-parse time regardless of any other setting.
 */

const gateSchema = z.object({
  id: z.string(),
  requirement: z.string(),
  satisfied: z.boolean(),
  evidence: z.string().nullable(),
  approver: z.string().nullable(),
});

const productionReadinessSchema = z.object({
  moneyMode: z.string(),
  gates: z.array(gateSchema).min(1),
});

export type ProductionReadinessGate = z.infer<typeof gateSchema>;

const DEFAULT_PRODUCTION_READINESS_PATH = "production-readiness.json";

/**
 * Returns `undefined` if the file is missing, unreadable, or fails to parse — every one of
 * those cases means "not ready," never "assume ready." Never throws for a missing/invalid file,
 * since the caller (the config schema's `refine`) treats `undefined` the same as "no gates
 * satisfied."
 */
export function readProductionReadinessGates(
  filePath: string = DEFAULT_PRODUCTION_READINESS_PATH,
): readonly ProductionReadinessGate[] | undefined {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = productionReadinessSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.gates : undefined;
  } catch {
    return undefined;
  }
}

export function allGatesSatisfied(gates: readonly ProductionReadinessGate[] | undefined): boolean {
  return gates !== undefined && gates.length > 0 && gates.every((gate) => gate.satisfied);
}

export function unmetGateIds(
  gates: readonly ProductionReadinessGate[] | undefined,
): readonly string[] {
  if (gates === undefined) return [];
  return gates.filter((gate) => !gate.satisfied).map((gate) => gate.id);
}
