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
      // Positive fixture: route calls the self-scoped authorizeSelf(...) wrapper.
      {
        code: "export function POST() { authorizeSelf(deps, token, 'session:revoke'); return Response.json({}); }",
        filename: "src/app/api/me/sessions/route.ts",
      },
      // Positive fixture: route explicitly opts out via a PUBLIC_ROUTE comment
      // marker. A real `export const PUBLIC_ROUTE` is rejected by Next.js's
      // own route-export validator at build time, so the opt-out must be a
      // comment rather than an export.
      {
        code: "// PUBLIC_ROUTE\nexport function GET() { return Response.json({}); }",
        filename: "src/app/api/health/route.ts",
      },
      // Files outside src/app/api are not checked.
      {
        code: "export function helper() { return 1; }",
        filename: "src/app/page.ts",
      },
      // Shared modules under src/app/api/** that aren't route files (e.g. Zod
      // schemas shared across route handlers) are not checked — the route
      // file importing them is what must call authorize()/PUBLIC_ROUTE.
      {
        code: "export const schema = {};",
        filename: "src/app/api/v1/auth/schemas.ts",
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
