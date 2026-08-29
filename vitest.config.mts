import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * MET-COV-01/03 (Claude/Metrics.md): the financial core is held to a stricter
 * bar than the rest of src/**. Thresholds are enforced (`vitest run --coverage`
 * exits non-zero on a miss), not just reported.
 *
 * CI runs `--coverage` separately for `unit` and `integration` (each covering only part of
 * `src/**`), so per-run thresholds would always fail on a partial slice. `COVERAGE_SPLIT=true`
 * disables in-process threshold enforcement for those split runs; `coverage:check` (run in the
 * `coverage` job, after `coverage:merge` combines both reports) enforces the real thresholds
 * against the combined total instead.
 */
const enforceThresholds = process.env.COVERAGE_SPLIT !== "true";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Migration test files (tests/db/**) share one Postgres DB and each resets the
    // schema in beforeAll; running files in parallel races on DROP SCHEMA/CREATE SCHEMA.
    fileParallelism: false,
    include: [
      "src/**/*.test.{ts,tsx}",
      "tooling/**/*.test.{ts,mjs,cjs}",
      "tests/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/app/**", "src/**/*.d.ts"],
      thresholds: enforceThresholds
        ? {
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
          }
        : undefined,
    },
  },
});
