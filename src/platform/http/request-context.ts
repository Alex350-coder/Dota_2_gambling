import { hashIdentifier } from "@/platform/crypto";
import type { Config } from "@/platform/config";

/** Best-effort client IP extraction behind a proxy/load balancer. */
export function clientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return null;
}

export function clientIpHash(request: Request): string {
  return hashIdentifier(clientIp(request) ?? "unknown");
}

export function sessionTokenFromRequest(request: Request, config: Config): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }
  const prefix = `${config.SESSION_COOKIE_NAME}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return undefined;
}
