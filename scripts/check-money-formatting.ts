import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Enforces T-703's acceptance criterion: `<Money>` (`src/ui/money/Money.tsx`) is the only place
 * allowed to turn a minor-unit amount into a displayed string. Run via `pnpm check:money-format`.
 */
const ALLOWED_FILE = path.join("src", "ui", "money", "Money.tsx");
const SEARCH_ROOT = "src";
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);
const TEST_SUFFIXES = [".test.ts", ".test.tsx"];

const FORBIDDEN_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "toFixed(2) money formatting", pattern: /\.toFixed\(\s*2\s*\)/ },
  {
    name: "currency-style Intl.NumberFormat",
    pattern: /Intl\.NumberFormat\([^)]*style:\s*["']currency["']/,
  },
];

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main(): Promise<void> {
  const files = await collectFiles(SEARCH_ROOT);
  const violations: string[] = [];

  for (const file of files) {
    if (file === ALLOWED_FILE) {
      continue;
    }
    if (TEST_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
      continue;
    }

    const content = await readFile(file, "utf8");
    for (const { name, pattern } of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${file}: ${name} — use <Money> instead`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Money formatting found outside src/ui/money/Money.tsx:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("check:money-format — no ad hoc money formatting found outside <Money>.");
}

void main();
