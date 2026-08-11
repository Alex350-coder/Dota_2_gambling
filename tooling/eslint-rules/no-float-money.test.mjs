import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-float-money.cjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester();

describe("no-float-money", () => {
  ruleTester.run("no-float-money", rule, {
    valid: [
      // Positive fixture: allowed inside src/domain/money.
      {
        code: "const total = stake + payout;",
        filename: "src/domain/money/arith.ts",
      },
      // Non-money identifiers are never flagged.
      {
        code: "const total = a + b;",
        filename: "src/app/page.ts",
      },
    ],
    invalid: [
      // Negative fixture: money arithmetic outside src/domain/money is rejected.
      {
        code: "const total = stakeMinor + payoutMinor;",
        filename: "src/app/bet/route.ts",
        errors: [{ messageId: "noFloatMoney" }],
      },
      {
        code: "balance += amount;",
        filename: "src/app/wallet.ts",
        errors: [{ messageId: "noFloatMoney" }],
      },
    ],
  });
});
