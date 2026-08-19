-- Purpose: Postgres-backed rate limiting (T-313) — fixed-window counters keyed
-- by (bucket key, window start), where the bucket key already encodes the
-- rate-limit class and the identity (user id or IP hash) per Routes.md §4.
-- Affected: new table rate_limit_buckets.
-- Rollback: DROP TABLE rate_limit_buckets;
-- Destructive: no (additive).

CREATE TABLE rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

GRANT SELECT, INSERT, UPDATE ON rate_limit_buckets TO app_role;
REVOKE DELETE, TRUNCATE ON rate_limit_buckets FROM app_role;
