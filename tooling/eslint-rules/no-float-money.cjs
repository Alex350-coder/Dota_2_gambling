"use strict";

const MONEY_IDENTIFIER = /Minor$|amount|stake|payout|balance/i;
const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/", "%", "**"]);
const ALLOWED_PATH_SEGMENT = /(^|[\\/])src[\\/]domain[\\/]money([\\/]|$)/;

function isMoneyIdentifier(node) {
  return node && node.type === "Identifier" && MONEY_IDENTIFIER.test(node.name);
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow arithmetic operators on money-like identifiers (amount/stake/payout/balance/*Minor) outside src/domain/money.",
    },
    schema: [],
    messages: {
      noFloatMoney:
        "Arithmetic on money-like identifier '{{name}}' is only allowed inside src/domain/money. Use the Money arithmetic helpers instead.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (ALLOWED_PATH_SEGMENT.test(filename)) {
      return {};
    }

    return {
      BinaryExpression(node) {
        if (!ARITHMETIC_OPERATORS.has(node.operator)) return;
        const offender = isMoneyIdentifier(node.left)
          ? node.left
          : isMoneyIdentifier(node.right)
            ? node.right
            : null;
        if (offender) {
          context.report({ node, messageId: "noFloatMoney", data: { name: offender.name } });
        }
      },
      AssignmentExpression(node) {
        if (!ARITHMETIC_OPERATORS.has(node.operator.replace("=", ""))) return;
        if (isMoneyIdentifier(node.left)) {
          context.report({ node, messageId: "noFloatMoney", data: { name: node.left.name } });
        }
      },
      UpdateExpression(node) {
        if (isMoneyIdentifier(node.argument)) {
          context.report({ node, messageId: "noFloatMoney", data: { name: node.argument.name } });
        }
      },
    };
  },
};
