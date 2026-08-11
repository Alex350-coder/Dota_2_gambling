"use strict";

const DOMAIN_PATH = /(^|[\\/])src[\\/]domain([\\/]|$)/;
const FORBIDDEN_SOURCE = /^(next(\/|$)|pg(\/|$)|drizzle-orm(\/|$)|node:)/;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow imports of next, pg, drizzle-orm, or node:* built-ins inside src/domain to keep the domain layer free of I/O and framework dependencies.",
    },
    schema: [],
    messages: {
      domainPurity:
        "Importing '{{source}}' inside src/domain is not allowed. The domain layer must have zero I/O or framework dependencies.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!DOMAIN_PATH.test(filename)) {
      return {};
    }

    function checkSource(node, source) {
      if (FORBIDDEN_SOURCE.test(source)) {
        context.report({ node, messageId: "domainPurity", data: { source } });
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && typeof node.source.value === "string") {
          checkSource(node, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length > 0 &&
          node.arguments[0].type === "Literal" &&
          typeof node.arguments[0].value === "string"
        ) {
          checkSource(node, node.arguments[0].value);
        }
      },
    };
  },
};
