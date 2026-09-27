import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allGatesSatisfied,
  readProductionReadinessGates,
  unmetGateIds,
  type ProductionReadinessGate,
} from "./production-readiness";

function gate(id: string, satisfied: boolean): ProductionReadinessGate {
  return { id, requirement: `req ${id}`, satisfied, evidence: null, approver: null };
}

describe("allGatesSatisfied", () => {
  it("is false when gates is undefined (file missing/unreadable/invalid)", () => {
    expect(allGatesSatisfied(undefined)).toBe(false);
  });

  it("is false when at least one gate is unsatisfied", () => {
    expect(allGatesSatisfied([gate("G-01", true), gate("G-02", false)])).toBe(false);
  });

  it("is true only when every gate is satisfied", () => {
    expect(allGatesSatisfied([gate("G-01", true), gate("G-02", true)])).toBe(true);
  });

  it("is false for an empty gate list — no gates recorded is not 'all satisfied'", () => {
    expect(allGatesSatisfied([])).toBe(false);
  });
});

describe("unmetGateIds", () => {
  it("returns an empty list when gates is undefined", () => {
    expect(unmetGateIds(undefined)).toEqual([]);
  });

  it("lists only the unsatisfied gate ids", () => {
    expect(unmetGateIds([gate("G-01", true), gate("G-02", false), gate("G-03", false)])).toEqual([
      "G-02",
      "G-03",
    ]);
  });
});

describe("readProductionReadinessGates", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined for a missing file", () => {
    expect(readProductionReadinessGates("/no/such/path/production-readiness.json")).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    dir = mkdtempSync(path.join(tmpdir(), "prg-test-"));
    const filePath = path.join(dir, "production-readiness.json");
    writeFileSync(filePath, "{ not valid json");

    expect(readProductionReadinessGates(filePath)).toBeUndefined();
  });

  it("returns undefined when the shape doesn't match the schema", () => {
    dir = mkdtempSync(path.join(tmpdir(), "prg-test-"));
    const filePath = path.join(dir, "production-readiness.json");
    writeFileSync(filePath, JSON.stringify({ gates: "not an array" }));

    expect(readProductionReadinessGates(filePath)).toBeUndefined();
  });

  it("parses a well-formed file and returns its gates", () => {
    dir = mkdtempSync(path.join(tmpdir(), "prg-test-"));
    const filePath = path.join(dir, "production-readiness.json");
    writeFileSync(
      filePath,
      JSON.stringify({ moneyMode: "SIMULATED", gates: [gate("G-01", false)] }),
    );

    const gates = readProductionReadinessGates(filePath);
    expect(gates).toHaveLength(1);
    expect(gates?.[0]?.id).toBe("G-01");
  });

  it("reads the repository's real production-readiness.json with every gate unsatisfied", () => {
    // No path argument — exercises the default (repo-root) path this project actually ships,
    // proving the real file is well-formed and, per the project's own rules, still 0/22 met.
    const gates = readProductionReadinessGates();
    expect(gates).toHaveLength(22);
    expect(allGatesSatisfied(gates)).toBe(false);
    expect(unmetGateIds(gates)).toHaveLength(22);
  });
});
