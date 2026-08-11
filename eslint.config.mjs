import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import noFloatMoney from "./tooling/eslint-rules/no-float-money.cjs";
import noRawSqlConcat from "./tooling/eslint-rules/no-raw-sql-concat.cjs";
import requireAuthz from "./tooling/eslint-rules/require-authz.cjs";
import domainPurity from "./tooling/eslint-rules/domain-purity.cjs";
import noConsole from "./tooling/eslint-rules/no-console.cjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const projectRulesPlugin = {
  rules: {
    "no-float-money": noFloatMoney,
    "no-raw-sql-concat": noRawSqlConcat,
    "require-authz": requireAuthz,
    "domain-purity": domainPurity,
    "no-console": noConsole,
  },
};

const eslintConfig = tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      "delete_files/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      project: projectRulesPlugin,
    },
    rules: {
      "project/no-console": "error",
      "max-lines": ["error", { max: 800, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 15],
      "project/no-float-money": "error",
      "project/no-raw-sql-concat": "error",
      "project/require-authz": "error",
      "project/domain-purity": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    plugins: {
      project: projectRulesPlugin,
    },
    rules: {
      "project/no-console": "error",
    },
  },
  eslintConfigPrettier,
);

export default eslintConfig;
