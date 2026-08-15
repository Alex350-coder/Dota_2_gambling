-- Purpose: enable extensions required by every later migration (gen_random_uuid() for
-- uuid PKs, citext for case-insensitive email). Affected: none (extension-level only).
-- Rollback: DROP EXTENSION citext; DROP EXTENSION pgcrypto; (only if nothing depends on them).
-- Destructive: no.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
