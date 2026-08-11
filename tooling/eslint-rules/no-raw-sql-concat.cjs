"use strict";

const SQL_KEYWORD = /\b(SELECT|INSERT|UPDATE|DELETE)\b/i;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow template literals that mix a SQL keyword (SELECT|INSERT|UPDATE|DELETE) with an interpolated expression, to prevent SQL injection via string concatenation.",
    },
    schema: [],
    messages: {
      noRawSqlConcat:
        "Template literal appears to build a SQL statement with interpolated values. Use parameterized queries instead of string concatenation.",
    },
  },
  create(context) {
    return {
      TemplateLiteral(node) {
        if (node.expressions.length === 0) return;
        const hasSqlKeyword = node.quasis.some((quasi) => SQL_KEYWORD.test(quasi.value.raw));
        if (hasSqlKeyword) {
          context.report({ node, messageId: "noRawSqlConcat" });
        }
      },
    };
  },
};
