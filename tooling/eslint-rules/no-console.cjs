"use strict";

module.exports = {
  meta: {
    type: "problem",
    hasSuggestions: true,
    docs: {
      description:
        "Disallow console.* calls; use the platform logger instead so output goes through structured, redacted logging.",
    },
    schema: [],
    messages: {
      noConsole: "Unexpected console.{{method}}. Use the platform logger instead.",
      useLogger: "Replace console.{{method}} with logger.{{method}}",
    },
  },
  create(context) {
    return {
      "CallExpression[callee.object.name='console']"(node) {
        const method = node.callee.property.name;
        context.report({
          node,
          messageId: "noConsole",
          data: { method },
          suggest: [
            {
              messageId: "useLogger",
              data: { method },
              fix(fixer) {
                return fixer.replaceText(node.callee.object, "logger");
              },
            },
          ],
        });
      },
    };
  },
};
