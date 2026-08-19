import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque, unguessable bearer token (256 bits of entropy) plus its stable SHA-256
 * digest for at-rest storage — only the hash is ever persisted (Security.md §5).
 * Lives in src/platform/** (not src/domain/**) because it uses node:crypto directly,
 * which RULE-A01 domain purity forbids.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * SHA-256 digest of a low-entropy identifier (email, IP address) for use as a
 * non-reversible correlation key (login_attempts.email_hash/ip_hash, Security.md
 * §5 / §9) — same primitive as hashToken, named separately because callers are
 * hashing PII for correlation, not a high-entropy secret for at-rest storage.
 */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
