/**
 * Redaction allowlist (T-910, OBSERVABILITY.md §2, RULE-E09): these keys never appear in a log
 * line's value, regardless of nesting depth or casing. `email` is included because a *full*
 * email must be logged as a hash, never verbatim — callers that legitimately need to log a
 * user's email must hash it themselves and pass a differently-named field (e.g. `emailHash`);
 * this redactor cannot tell a hash from a raw address, so it blocks the raw key outright.
 */
const REDACTED_KEYS = new Set([
  "password",
  "token",
  "cookie",
  "authorization",
  "mfasecret",
  "sessionid",
  "email",
]);

const REDACTED_VALUE = "[REDACTED]";

function isRedactedKey(key: string): boolean {
  return REDACTED_KEYS.has(key.toLowerCase());
}

/**
 * Recursively redacts denylisted fields from a log payload before it reaches pino — applied to
 * every value at every depth (unlike pino's own `redact` option, which only matches fixed
 * paths), so a secret nested inside an arbitrary provider-payload object is still caught.
 */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (value !== null && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = isRedactedKey(key) ? REDACTED_VALUE : redact(entry, seen);
    }
    return result;
  }

  return value;
}
