/**
 * Small bundled list of widely known breached/common passwords (Validation.md line 68:
 * "checked against a breached-password list (k-anonymity API or local list)"). No external
 * API call is made — this is the local-list option, avoiding a network dependency for the
 * MVP and keeping registration deterministic and offline-testable.
 */
const COMMON_BREACHED_PASSWORDS: ReadonlySet<string> = new Set([
  "password123",
  "password1234",
  "12345678901",
  "123456789012",
  "qwertyuiop12",
  "letmein12345",
  "welcome12345",
  "changeme1234",
  "iloveyou1234",
  "admin1234567",
  "sunshine1234",
  "princess1234",
  "football1234",
  "dragon123456",
  "monkey123456",
]);

export function isBreachedPassword(password: string): boolean {
  return COMMON_BREACHED_PASSWORDS.has(password.toLowerCase());
}
