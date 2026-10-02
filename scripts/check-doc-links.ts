import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * T-1008 (documentation audit, MET-DOC-01): checks every relative markdown link inside this
 * repository's own `**\/*.md` files (README.md, SECURITY.md, tests/**\/*.md) resolves to a real
 * file. Scoped to `Dota_2/**` only — this repository's planning documentation lives one
 * directory up (`Claude/**`) outside this git repository, so it is out of this script's reach
 * by design, not by oversight.
 */

const LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;

interface BrokenLink {
  readonly file: string;
  readonly link: string;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".stryker-tmp",
  "delete_files",
  "coverage",
  ".husky",
]);

async function findMarkdownFiles(dir = "."): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      files.push(...(await findMarkdownFiles(path.join(dir, entry.name))));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.relative(".", path.join(dir, entry.name)));
    }
  }

  return files;
}

function isExternalOrAnchor(link: string): boolean {
  return (
    link.startsWith("http://") ||
    link.startsWith("https://") ||
    link.startsWith("#") ||
    link.startsWith("mailto:")
  );
}

async function checkFile(relativePath: string): Promise<BrokenLink[]> {
  const content = await readFile(relativePath, "utf8");
  const broken: BrokenLink[] = [];

  for (const match of content.matchAll(LINK_PATTERN)) {
    const link = match[1]?.split("#")[0]?.trim();
    if (!link || link.length === 0 || isExternalOrAnchor(link)) continue;

    const resolved = path.resolve(path.dirname(relativePath), link);
    if (!existsSync(resolved)) {
      broken.push({ file: relativePath, link });
    }
  }

  return broken;
}

async function main(): Promise<void> {
  const files = await findMarkdownFiles();
  const results = await Promise.all(files.map(checkFile));
  const broken = results.flat();

  if (broken.length > 0) {
    for (const entry of broken) {
      console.error(`BROKEN LINK: ${entry.file} -> ${entry.link}`);
    }
    console.error(`check-doc-links: ${broken.length} broken internal link(s) (MET-DOC-01)`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-doc-links: ${files.length} markdown file(s) scanned, 0 broken internal links (MET-DOC-01 = 0)`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
