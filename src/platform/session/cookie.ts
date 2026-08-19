/**
 * Cookie attribute set required by Claude/Security.md §5, exactly:
 * `HttpOnly; Secure; SameSite=Lax; Path=/`.
 */
export interface SessionCookieOptions {
  readonly name: string;
  readonly maxAgeSeconds: number;
}

export function serializeSessionCookie(token: string, options: SessionCookieOptions): string {
  return [
    `${options.name}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${String(options.maxAgeSeconds)}`,
  ].join("; ");
}

/** Overwrites the cookie with an immediately-expired one (logout/revocation). */
export function serializeExpiredSessionCookie(name: string): string {
  return [`${name}=`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=0"].join("; ");
}
