"use strict";

const API_ROUTE_PATH = /(^|[\\/])src[\\/]app[\\/]api[\\/]/;

function callsAuthorize(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "authorize"
  );
}

function exportsPublicRouteMarker(node) {
  if (node.type !== "ExportNamedDeclaration" || !node.declaration) return false;
  const declaration = node.declaration;
  if (declaration.type !== "VariableDeclaration") return false;
  return declaration.declarations.some(
    (decl) => decl.id.type === "Identifier" && decl.id.name === "PUBLIC_ROUTE",
  );
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require every route handler under src/app/api/** to call authorize(...) or export a PUBLIC_ROUTE marker.",
    },
    schema: [],
    messages: {
      requireAuthz:
        "API route handlers must call authorize(...) or export a PUBLIC_ROUTE marker to explicitly opt out.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!API_ROUTE_PATH.test(filename)) {
      return {};
    }

    let hasAuthorizeCall = false;
    let hasPublicRouteMarker = false;

    return {
      CallExpression(node) {
        if (callsAuthorize(node)) {
          hasAuthorizeCall = true;
        }
      },
      ExportNamedDeclaration(node) {
        if (exportsPublicRouteMarker(node)) {
          hasPublicRouteMarker = true;
        }
      },
      "Program:exit"(node) {
        if (!hasAuthorizeCall && !hasPublicRouteMarker) {
          context.report({ node, messageId: "requireAuthz" });
        }
      },
    };
  },
};
