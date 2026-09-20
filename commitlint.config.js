module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "refactor", "docs", "test", "chore", "perf", "ci"]],
  },
  ignores: [(message) => message.includes("Co-authored-by: Copilot Autofix powered by AI")],
};
