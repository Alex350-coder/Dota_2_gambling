import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Stryker-only vitest config (T-1005): the financial-core domain tests are pure (no DB, no
 * network — RULE-C04), so mutation testing only needs to run this narrow slice, not the full
 * `src/**`/`tests/**` suite the default `vitest.config.mts` runs. Running the full suite under
 * Stryker would require a live DATABASE_URL for every mutant and would score files this phase
 * never intended to mutate. Deliberately standalone (not merged with `vitest.config.mts`) so a
 * future change to the default `include`/`coverage` block there cannot silently pull unrelated,
 * DB-dependent tests back into every mutant run.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/domain/money/**/*.test.ts",
      "src/domain/betting/**/*.test.ts",
      "src/domain/matching/**/*.test.ts",
      "src/domain/settlement/**/*.test.ts",
      "src/domain/ledger/**/*.test.ts",
    ],
  },
});
