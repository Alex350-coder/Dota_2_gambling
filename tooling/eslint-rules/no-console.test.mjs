import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-console.cjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester();

describe("no-console", () => {
  ruleTester.run("no-console", rule, {
    valid: [
      // Positive fixture: the platform logger is used instead of console.
      { code: "logger.info('server started');" },
      // Positive fixture: an unrelated object named `console` on a namespace is not console itself.
      { code: "app.console.log('not the global console');" },
    ],
    invalid: [
      // Negative fixture: console.log with a suggested fix to logger.log.
      {
        code: "console.log('debug output');",
        errors: [
          {
            messageId: "noConsole",
            data: { method: "log" },
            suggestions: [
              {
                messageId: "useLogger",
                data: { method: "log" },
                output: "logger.log('debug output');",
              },
            ],
          },
        ],
      },
      {
        code: "console.error(err);",
        errors: [
          {
            messageId: "noConsole",
            data: { method: "error" },
            suggestions: [
              {
                messageId: "useLogger",
                data: { method: "error" },
                output: "logger.error(err);",
              },
            ],
          },
        ],
      },
    ],
  });
});
