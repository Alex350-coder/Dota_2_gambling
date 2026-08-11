import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./require-authz.cjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester();

describe("require-authz", () => {
  ruleTester.run("require-authz", rule, {
    valid: [
      // Positive fixture: route calls authorize(...).
      {
        code: "export function GET() { authorize(request); return Response.json({}); }",
        filename: "src/app/api/bets/route.ts",
      },
      // Positive fixture: route explicitly opts out via PUBLIC_ROUTE marker.
      {
        code: "export const PUBLIC_ROUTE = true; export function GET() { return Response.json({}); }",
        filename: "src/app/api/health/route.ts",
      },
      // Files outside src/app/api are not checked.
      {
        code: "export function helper() { return 1; }",
        filename: "src/app/page.ts",
      },
    ],
    invalid: [
      // Negative fixture: no authorize(...) call and no PUBLIC_ROUTE marker.
      {
        code: "export function GET() { return Response.json({}); }",
        filename: "src/app/api/bets/route.ts",
        errors: [{ messageId: "requireAuthz" }],
      },
    ],
  });
});
