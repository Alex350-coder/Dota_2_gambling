/**
 * dependency-cruiser rules encoding Claude/Rules.md RULE-A01, RULE-A02 and RULE-A06.
 * Run via `pnpm depcruise` (src/** only — see package.json).
 */
const TOP_LEVEL_MODULES = ["domain", "application", "infra", "platform", "ui"];

// RULE-A06: one rule per module, forbidding deep imports into any *other* top-level
// module (i.e. anything beyond that module's own src/<module>/index.ts).
const noDeepImportsAcrossModules = TOP_LEVEL_MODULES.map((from) => {
  const others = TOP_LEVEL_MODULES.filter((name) => name !== from).join("|");
  return {
    name: `no-deep-imports-from-${from}`,
    comment:
      "RULE-A06: every module boundary exposes an explicit index.ts public surface; " +
      "deep imports into another top-level src/** module are prohibited.",
    severity: "error",
    from: { path: `^src/${from}/` },
    to: {
      path: `^src/(${others})/[^/]+/.+`,
      pathNot: `^src/(${others})/[^/]+/index\\.(ts|tsx)$`,
    },
  };
});

module.exports = {
  forbidden: [
    {
      name: "domain-purity",
      comment:
        "RULE-A01: src/domain/** is pure and framework-free. It must not import from " +
        "src/infra/**, src/app/**, or any I/O/framework package.",
      severity: "error",
      from: { path: "^src/domain" },
      to: {
        path: ["^src/infra", "^src/app", "^node_modules/(next|pg|drizzle-orm)", "^node:"],
      },
    },
    {
      name: "domain-no-node-builtins",
      comment: "RULE-A01: the domain layer must not reach for Node built-ins directly.",
      severity: "error",
      from: { path: "^src/domain" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "application-external-systems-via-ports",
      comment:
        "RULE-A02: external systems (database, payments, result feeds, mail, clock, ids, " +
        "RNG) must be reached through a port interface in src/domain/ports/**, not by " +
        "importing src/infra/** directly from the use-case layer.",
      severity: "error",
      from: { path: "^src/application" },
      to: { path: "^src/infra" },
    },
    ...noDeepImportsAcrossModules,
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
