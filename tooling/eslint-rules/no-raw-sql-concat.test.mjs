import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-raw-sql-concat.cjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester();

describe("no-raw-sql-concat", () => {
  ruleTester.run("no-raw-sql-concat", rule, {
    valid: [
      // Positive fixture: parameterized query, no interpolation in the SQL literal.
      { code: 'db.query("SELECT * FROM users WHERE id = $1", [userId]);' },
      // Positive fixture: interpolation with no SQL keyword present.
      { code: "const label = `Hello ${name}`;" },
    ],
    invalid: [
      // Negative fixture: SQL keyword combined with interpolation.
      {
        code: "db.query(`SELECT * FROM users WHERE id = ${userId}`);",
        errors: [{ messageId: "noRawSqlConcat" }],
      },
      {
        code: "db.query(`DELETE FROM sessions WHERE id = ${sessionId}`);",
        errors: [{ messageId: "noRawSqlConcat" }],
      },
    ],
  });
});
