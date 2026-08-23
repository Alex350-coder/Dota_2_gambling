import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOMAIN_ROOT = join(import.meta.dirname, "../../../src/domain");
const FORBIDDEN_TERMS = ["dota", "cs2", "counter-strike", "valorant", "league of legends", "lol"];

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("game-agnosticism gate (T-413)", () => {
  it("src/domain/** never references a specific game by name", () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(DOMAIN_ROOT)) {
      const content = readFileSync(file, "utf8").toLowerCase();
      for (const term of FORBIDDEN_TERMS) {
        if (content.includes(term)) {
          offenders.push(`${file}: contains "${term}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
