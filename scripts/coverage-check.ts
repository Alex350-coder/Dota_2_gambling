import { readFile } from "node:fs/promises";
import path from "node:path";

type CoverageRange = { start: { line: number }; end: { line: number } };
type FileCoverage = {
  path: string;
  statementMap: Record<string, CoverageRange>;
  fnMap: Record<string, unknown>;
  branchMap: Record<string, unknown>;
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
};
type CoverageMap = Record<string, FileCoverage>;

type Totals = { covered: number; total: number };
type Metrics = { lines: Totals; statements: Totals; functions: Totals; branches: Totals };

const MERGED_FILE = path.join("coverage-parts", "merged", "coverage-final.json");

// Mirrors vitest.config.mts's `coverage.thresholds` — MET-COV-03 (global) and MET-COV-01
// (financial core), kept enforced here too since the per-suite `vitest --coverage` runs only
// see their own slice of src/** and can't validate the combined total.
const GLOBAL_THRESHOLDS = { lines: 70, statements: 70, functions: 70, branches: 60 };
const FINANCIAL_CORE_THRESHOLDS = { lines: 95, statements: 95, functions: 95, branches: 90 };
const FINANCIAL_CORE_PATTERN =
  /[\\/]src[\\/]domain[\\/](money|betting|matching|settlement|ledger)[\\/]/;

function emptyMetrics(): Metrics {
  return {
    lines: { covered: 0, total: 0 },
    statements: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
  };
}

function accumulate(metrics: Metrics, file: FileCoverage): void {
  for (const hits of Object.values(file.s)) {
    metrics.statements.total += 1;
    if (hits > 0) metrics.statements.covered += 1;
  }
  for (const hits of Object.values(file.f)) {
    metrics.functions.total += 1;
    if (hits > 0) metrics.functions.covered += 1;
  }
  for (const branchHits of Object.values(file.b)) {
    for (const hits of branchHits) {
      metrics.branches.total += 1;
      if (hits > 0) metrics.branches.covered += 1;
    }
  }

  const coveredLines = new Set<number>();
  const allLines = new Set<number>();
  for (const [statementId, range] of Object.entries(file.statementMap)) {
    for (let line = range.start.line; line <= range.end.line; line++) {
      allLines.add(line);
      if ((file.s[statementId] ?? 0) > 0) coveredLines.add(line);
    }
  }
  metrics.lines.total += allLines.size;
  metrics.lines.covered += coveredLines.size;
}

function pct(totals: Totals): number {
  return totals.total === 0 ? 100 : (totals.covered / totals.total) * 100;
}

function checkThresholds(
  label: string,
  metrics: Metrics,
  thresholds: Record<keyof Metrics, number>,
): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(thresholds) as (keyof Metrics)[]) {
    const actual = pct(metrics[key]);
    if (actual < thresholds[key]) {
      errors.push(
        `${label}: coverage for ${key} (${actual.toFixed(2)}%) does not meet threshold (${thresholds[key]}%)`,
      );
    }
  }
  return errors;
}

async function main(): Promise<void> {
  const raw = await readFile(MERGED_FILE, "utf-8");
  const coverageMap = JSON.parse(raw) as CoverageMap;

  const global = emptyMetrics();
  const financialCore = emptyMetrics();

  for (const file of Object.values(coverageMap)) {
    accumulate(global, file);
    if (FINANCIAL_CORE_PATTERN.test(file.path)) {
      accumulate(financialCore, file);
    }
  }

  const errors = [
    ...checkThresholds("global (MET-COV-03)", global, GLOBAL_THRESHOLDS),
    ...checkThresholds("financial core (MET-COV-01)", financialCore, FINANCIAL_CORE_THRESHOLDS),
  ];

  console.log(
    `coverage:check: global lines=${pct(global.lines).toFixed(2)}% statements=${pct(global.statements).toFixed(2)}% functions=${pct(global.functions).toFixed(2)}% branches=${pct(global.branches).toFixed(2)}%`,
  );
  console.log(
    `coverage:check: financial core lines=${pct(financialCore.lines).toFixed(2)}% statements=${pct(financialCore.statements).toFixed(2)}% functions=${pct(financialCore.functions).toFixed(2)}% branches=${pct(financialCore.branches).toFixed(2)}%`,
  );

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("coverage:check: all thresholds met");
}

void main();
