import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * MET-T-03 (`Claude/Testing.md` §5, `Claude/domain/MATCHING_ENGINE.md` §8): every one of the
 * 32 named mandatory scenario IDs must be referenced by at least one test file. This scans
 * `src/**` and `tests/**` for each id and fails the build if any is unreferenced — a scenario ID
 * that appears nowhere in the suite means its behaviour is untested, not that it's out of scope.
 */
const MANDATORY_IDS: readonly string[] = [
  ...Array.from({ length: 21 }, (_, i) => `FIN-${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 4 }, (_, i) => `PROP-${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 7 }, (_, i) => `CC-${String(i + 1).padStart(2, "0")}`),
];

const SCAN_ROOTS = ["src", "tests"];
const TEST_FILE_PATTERN = /\.test\.ts$/;

async function collectTestFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(fullPath)));
    } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main(): Promise<void> {
  const testFiles = (await Promise.all(SCAN_ROOTS.map((root) => collectTestFiles(root)))).flat();

  const seen = new Map<string, string[]>();
  for (const id of MANDATORY_IDS) seen.set(id, []);

  for (const filePath of testFiles) {
    const content = await readFile(filePath, "utf-8");
    for (const id of MANDATORY_IDS) {
      // Word-boundary match so e.g. `CC-01` doesn't also count as a hit for `CC-1` variants.
      if (new RegExp(`\\b${id}\\b`).test(content)) {
        seen.get(id)?.push(filePath);
      }
    }
  }

  const missing = MANDATORY_IDS.filter((id) => (seen.get(id)?.length ?? 0) === 0);
  const found = MANDATORY_IDS.length - missing.length;

  console.log(`test:manifest: ${found}/${MANDATORY_IDS.length} mandatory scenario ids covered`);

  if (missing.length > 0) {
    console.error(`ERROR: missing test coverage for: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("test:manifest: MET-T-03 = 32/32, all mandatory scenario ids covered");
}

void main();
