import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { buildSecurityHeaders, generateNonce } from "@/platform/headers/security-headers";
import type { RateLimitClass } from "@/infra/db";
import { getContainer } from "./container";
import { clientIpHash } from "./request-context";
import { toErrorResponse } from "./errors";

/**
 * Applies the exact header set from Security.md §8 to every response this
 * app returns, success or failure — the single place that decision is made
 * so no route handler can forget it.
 */
function withSecurityHeaders<T>(response: NextResponse<T>): NextResponse<T> {
  const headers = buildSecurityHeaders({ nonce: generateNonce() });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Enforces the Postgres-backed rate limit for a route's class (Routes.md §4)
 * before running its handler. Throws the same DomainError shape every other
 * boundary uses, with `Retry-After` carried in `details` so the wrapper can
 * surface it as a real header on the 429 response.
 */
async function enforceRateLimit(
  request: Request,
  rateLimitClass: RateLimitClass,
  userId: string | null,
): Promise<void> {
  const container = getContainer();
  if (!container.config.RATE_LIMIT_ENABLED) {
    return;
  }
  const ipHash = clientIpHash(request);
  const result = await container.uow.run((tx) =>
    container.rateLimiter.check(tx, { rateLimitClass, userId, ipHash }),
  );
  if (!result.allowed) {
    throw new DomainError("RATE_LIMITED", "too many requests, try again later", {
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}

export interface RunRouteOptions {
  readonly request: Request;
  readonly rateLimitClass: RateLimitClass;
  readonly userId?: string | null;
  readonly handler: () => Promise<NextResponse>;
}

/**
 * Wraps every route handler under src/app/api/**: rate limit, then the
 * handler, then the shared error envelope (T-318) and security headers on
 * both the success and failure path — used instead of duplicating this
 * sequence in every route file.
 */
export async function runRoute(options: RunRouteOptions): Promise<NextResponse> {
  try {
    await enforceRateLimit(options.request, options.rateLimitClass, options.userId ?? null);
    const response = await options.handler();
    return withSecurityHeaders(response);
  } catch (error) {
    const response = withSecurityHeaders(toErrorResponse(error));
    if (error instanceof DomainError && error.code === "RATE_LIMITED") {
      const retryAfterSeconds = error.details?.retryAfterSeconds;
      if (typeof retryAfterSeconds === "number") {
        response.headers.set("Retry-After", String(retryAfterSeconds));
      }
    }
    return response;
  }
}
