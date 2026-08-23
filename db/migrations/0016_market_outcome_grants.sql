-- Purpose: T-406/T-407 — grant app_role the access it was missing on markets/outcomes
-- (0006_catalog.sql created both tables but never granted app_role on them, the same gap
-- 0014/0015 fixed for the other catalog tables). markets needs UPDATE for status transitions
-- (T-407); outcomes is set once at market creation and never mutated afterwards.
-- Affected [tables]: app_role grants on markets, outcomes.
-- Rollback: REVOKE ALL ON markets, outcomes FROM app_role;
-- Destructive: no (grants only).

GRANT SELECT, INSERT, UPDATE ON markets TO app_role;
REVOKE DELETE, TRUNCATE ON markets FROM app_role;

GRANT SELECT, INSERT ON outcomes TO app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON outcomes FROM app_role;
