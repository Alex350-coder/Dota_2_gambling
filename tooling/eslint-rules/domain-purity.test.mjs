import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./domain-purity.cjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

describe("domain-purity", () => {
  ruleTester.run("domain-purity", rule, {
    valid: [
      // Positive fixture: pure domain module with no forbidden imports.
      {
        code: "import { Money } from './money';",
        filename: "src/domain/betting/order.ts",
      },
      // Forbidden imports are allowed outside src/domain.
      {
        code: "import pg from 'pg';",
        filename: "src/platform/db/client.ts",
      },
    ],
    invalid: [
      // Negative fixture: framework import inside src/domain.
      {
        code: "import { NextResponse } from 'next/server';",
        filename: "src/domain/betting/order.ts",
        errors: [{ messageId: "domainPurity" }],
      },
      {
        code: "import fs from 'node:fs';",
        filename: "src/domain/money/types.ts",
        errors: [{ messageId: "domainPurity" }],
      },
    ],
  });
});
