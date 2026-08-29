import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

const PARTS_DIR = "coverage-parts";
const OUT_DIR = path.join(PARTS_DIR, "merged");
const OUT_FILE = path.join(OUT_DIR, "coverage-final.json");

function mergeFile(a: FileCoverage, b: FileCoverage): FileCoverage {
  const s: Record<string, number> = { ...a.s };
  for (const key of Object.keys(b.s)) s[key] = (s[key] ?? 0) + (b.s[key] ?? 0);

  const f: Record<string, number> = { ...a.f };
  for (const key of Object.keys(b.f)) f[key] = (f[key] ?? 0) + (b.f[key] ?? 0);

  const branch: Record<string, number[]> = {};
  for (const key of new Set([...Object.keys(a.b), ...Object.keys(b.b)])) {
    const branchA = a.b[key] ?? [];
    const branchB = b.b[key] ?? [];
    const length = Math.max(branchA.length, branchB.length);
    branch[key] = Array.from({ length }, (_, i) => (branchA[i] ?? 0) + (branchB[i] ?? 0));
  }

  return { ...a, s, f, b: branch };
}

async function loadCoverageMap(dir: string): Promise<CoverageMap> {
  const file = path.join(dir, "coverage-final.json");
  const raw = await readFile(file, "utf-8");
  return JSON.parse(raw) as CoverageMap;
}

async function main(): Promise<void> {
  const entries = await readdir(PARTS_DIR, { withFileTypes: true });
  const partDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("coverage-"))
    .map((entry) => path.join(PARTS_DIR, entry.name));

  if (partDirs.length === 0) {
    console.error(`coverage:merge: no coverage-* directories found under ${PARTS_DIR}/`);
    process.exitCode = 1;
    return;
  }

  const merged: CoverageMap = {};
  for (const dir of partDirs) {
    const coverageMap = await loadCoverageMap(dir);
    for (const [file, fileCoverage] of Object.entries(coverageMap)) {
      merged[file] = merged[file] ? mergeFile(merged[file], fileCoverage) : fileCoverage;
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(merged));

  console.log(
    `coverage:merge: merged ${partDirs.length} report(s) covering ${Object.keys(merged).length} file(s) -> ${OUT_FILE}`,
  );
}

void main();
