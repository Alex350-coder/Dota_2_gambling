import { defineConfig } from "vitest/config";

/**
 * MET-COV-01/03 (Claude/Metrics.md): the financial core is held to a stricter
 * bar than the rest of src/**. Thresholds are enforced (`vitest run --coverage`
 * exits non-zero on a miss), not just reported.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tooling/**/*.test.{ts,mjs,cjs}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/app/**", "src/**/*.d.ts"],
      thresholds: {
        // MET-COV-03: the rest of src/**.
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
        // MET-COV-01: the critical financial core.
        "src/domain/{money,betting,matching,settlement,ledger}/**": {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 90,
        },
      },
    },
  },
});
