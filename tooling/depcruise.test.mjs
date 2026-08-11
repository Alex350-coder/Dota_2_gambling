import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const configPath = resolve(__dirname, "depcruise.cjs");
const cliBin = resolve(repoRoot, "node_modules/dependency-cruiser/bin/dependency-cruise.mjs");

function runDepcruise(fixtureDir) {
  return spawnSync(
    process.execPath,
    [cliBin, "src", "--config", configPath, "--output-type", "err"],
    {
      cwd: resolve(__dirname, "__fixtures__", fixtureDir),
      encoding: "utf8",
    },
  );
}

describe("tooling/depcruise.cjs", () => {
  it("detects a RULE-A01 violation: domain importing from infra", () => {
    const result = runDepcruise("depcruise-invalid");

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("domain-purity");
    expect(result.stdout).toContain("src/domain/money/violation.js");
  });

  it("passes cleanly on a fixture that respects module boundaries", () => {
    const result = runDepcruise("depcruise-valid");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no dependency violations found");
  });
});
