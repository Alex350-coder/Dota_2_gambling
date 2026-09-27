import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-916 — "missing event fails CI". Every audit-event builder exported from
 * `src/application/audit/writer.ts` must be wired into at least one real use case; a builder
 * defined but never called is exactly the silent-omission bug this test exists to catch (a
 * developer added `fooHappenedEvent()` but forgot the `audit.record(tx, fooHappenedEvent(...))`
 * call site, so the action is documented as auditable in OBSERVABILITY.md §1 but never actually
 * written). This is a static coverage check, not a re-run of every historical use case's own
 * "emits exactly one X event" integration test (those already exist per builder, scattered
 * across tests/integration/application/**) — it closes the gap those tests can't: proving no
 * builder was ever left orphaned.
 */
const WRITER_FILE = path.join("src", "application", "audit", "writer.ts");
const SEARCH_ROOT = "src";
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

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

async function findEventBuilderNames(): Promise<string[]> {
  const content = await readFile(WRITER_FILE, "utf8");
  const matches = content.matchAll(/^export function (\w+)\(/gm);
  return [...matches].map((match) => match[1] as string);
}

describe("audit event builder coverage (T-916)", () => {
  it("every exported audit event builder is called from at least one non-test file", async () => {
    const builderNames = await findEventBuilderNames();
    expect(builderNames.length).toBeGreaterThan(0);

    const files = (await collectFiles(SEARCH_ROOT)).filter(
      (file) => file !== WRITER_FILE && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
    );
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    const orphaned = builderNames.filter(
      (name) => !contents.some((content) => content.includes(`${name}(`)),
    );

    expect(orphaned).toEqual([]);
  });

  it("every non-test call site passes the result to an audit writer's record(...)", async () => {
    const builderNames = await findEventBuilderNames();
    const files = (await collectFiles(SEARCH_ROOT)).filter(
      (file) => file !== WRITER_FILE && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
    );
    const fileContents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    const missingRecordUsage = builderNames.filter((name) => {
      return !fileContents.some((content) => {
        if (!content.includes(`${name}(`)) return false;
        // A call site's own line, or the two lines before it, should reference `.record(`
        // (e.g. `audit.record(tx, fooEvent(...))`) — a builder that's merely imported or
        // referenced without ever reaching a writer's record() call is still effectively dead.
        const lines = content.split("\n");
        return lines.some((line, index) => {
          if (!line.includes(`${name}(`)) return false;
          const windowStart = Math.max(0, index - 2);
          return lines
            .slice(windowStart, index + 1)
            .join("\n")
            .includes(".record(");
        });
      });
    });

    expect(missingRecordUsage).toEqual([]);
  });
});
