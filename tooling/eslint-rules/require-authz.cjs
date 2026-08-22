"use strict";

// Only actual Next.js route handler files are checked — shared modules under
// src/app/api/** (e.g. Zod schemas imported by multiple routes) are not
// themselves route handlers, so they never call authorize()/PUBLIC_ROUTE.
const API_ROUTE_PATH = /(^|[\\/])src[\\/]app[\\/]api[\\/].*route\.[jt]sx?$/;

const AUTHZ_CALLEE_NAMES = new Set(["authorize", "authorizeSelf"]);

function callsAuthorize(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    AUTHZ_CALLEE_NAMES.has(node.callee.name)
  );
}

/**
 * A real `export const PUBLIC_ROUTE = ...` is rejected by Next.js's own
 * route-export validator at build time (only a fixed set of names — GET,
 * POST, config, runtime, etc. — may be exported from a route.ts file), so
 * the public-route opt-out has to be a comment marker instead of an export.
 */
function hasPublicRouteComment(context) {
  const sourceCode = context.sourceCode ?? context.getSourceCode();
  return sourceCode.getAllComments().some((comment) => comment.value.trim() === "PUBLIC_ROUTE");
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require every route.ts handler under src/app/api/** to call authorize(...)/authorizeSelf(...) or carry a `// PUBLIC_ROUTE` comment marker.",
    },
    schema: [],
    messages: {
      requireAuthz:
        "API route handlers must call authorize(...)/authorizeSelf(...) or carry a `// PUBLIC_ROUTE` comment marker to explicitly opt out.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!API_ROUTE_PATH.test(filename)) {
      return {};
    }

    let hasAuthorizeCall = false;

    return {
      CallExpression(node) {
        if (callsAuthorize(node)) {
          hasAuthorizeCall = true;
        }
      },
      "Program:exit"(node) {
        if (!hasAuthorizeCall && !hasPublicRouteComment(context)) {
          context.report({ node, messageId: "requireAuthz" });
        }
      },
    };
  },
};
