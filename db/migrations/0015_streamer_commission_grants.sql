-- Purpose: T-409 — add streamers.default_commission_bps so an admin can set a streamer's
-- commission before any market exists for them, and grant app_role the access it was missing
-- on streamers/streamer_channels (0006_catalog.sql created both tables but never granted
-- app_role on them, same gap 0014 fixed for market_types/economic_profiles). Changing
-- default_commission_bps never mutates an EconomicProfile already referenced by an existing
-- market — profiles are immutable snapshots (RULE-F04), so this column only affects markets
-- created after the change.
-- Affected [tables]: streamers (new column), app_role grants on streamers, streamer_channels.
-- Rollback: REVOKE ALL ON streamers, streamer_channels FROM app_role;
--   ALTER TABLE streamers DROP COLUMN default_commission_bps;
-- Destructive: no (additive column with a default; existing rows remain valid).

ALTER TABLE streamers
  ADD COLUMN default_commission_bps integer NOT NULL DEFAULT 2000
  CONSTRAINT chk_streamers_default_commission_bps_range CHECK (default_commission_bps BETWEEN 0 AND 10000);

GRANT SELECT, INSERT, UPDATE ON streamers TO app_role;
REVOKE DELETE, TRUNCATE ON streamers FROM app_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON streamer_channels TO app_role;
REVOKE TRUNCATE ON streamer_channels FROM app_role;
