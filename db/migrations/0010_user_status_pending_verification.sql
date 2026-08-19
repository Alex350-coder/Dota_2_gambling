-- Purpose: add the PENDING_VERIFICATION account state (T-302, T-303,
-- StateManagement.md #10: users start unverified and only reach ACTIVE after
-- verifying their email). Split into its own migration because Postgres forbids
-- using a newly added enum value (e.g. in a DEFAULT clause) inside the same
-- transaction that added it ("unsafe use of new value").
-- Affected: user_status enum.
-- Rollback: PENDING_VERIFICATION cannot be removed from an enum type without
--   recreating it — acceptable for a forward-only migration strategy (RULE-D01).
-- Destructive: no (additive).

ALTER TYPE user_status ADD VALUE 'PENDING_VERIFICATION';
