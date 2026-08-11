// Valid: application reaches the domain module only through its index.ts surface (RULE-A06).
import { addMinor } from "../../domain/index.js";

export function placeBet(stakeMinor) {
  return addMinor(stakeMinor, 0);
}
