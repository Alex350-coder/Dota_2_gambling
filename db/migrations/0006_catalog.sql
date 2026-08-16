-- Purpose: catalog schema (T-207) — games, tournaments, teams, matches, market types, streamers,
-- markets/outcomes, and economic_profiles. The game-agnostic modeling matches CLAUDE.md §1 ("Game
-- is a first-class entity"). economic_profiles' self-funding CHECK mirrors
-- src/domain/catalog/economic-profile.ts's MVP_ECONOMIC_PROFILE at the DB level: a profile is
-- only accepted if its fixed odds can never pay out more than the matched pool minus commission
-- and fee (odds_num * 10000 <= odds_den * (20000 - streamer_commission_bps - platform_fee_bps)).
-- Affected tables: games, game_modes, tournaments, teams, matches, match_participants,
--   market_types, economic_profiles, streamers, streamer_channels, markets, outcomes.
-- Rollback: DROP TABLE outcomes, markets, streamer_channels, streamers, economic_profiles,
--   market_types, match_participants, matches, teams, tournaments, game_modes, games;
--   DROP TYPE market_status;
-- Destructive: no (additive).

CREATE TYPE market_status AS ENUM (
  'DRAFT', 'OPEN', 'SUSPENDED', 'CLOSED', 'SETTLING', 'SETTLED', 'CANCELLED', 'VOID'
);

CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games (id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_game_modes_game_id ON game_modes (game_id);

CREATE TABLE tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games (id),
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_tournaments_dates CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_tournaments_game_id ON tournaments (game_id);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games (id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_teams_game_id ON teams (game_id);

CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments (id),
  game_mode_id uuid NOT NULL REFERENCES game_modes (id),
  scheduled_at timestamptz NOT NULL,
  played_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_matches_tournament_id ON matches (tournament_id);

CREATE TABLE match_participants (
  match_id uuid NOT NULL REFERENCES matches (id),
  team_id uuid NOT NULL REFERENCES teams (id),
  side text NOT NULL,
  PRIMARY KEY (match_id, team_id),
  CONSTRAINT chk_match_participants_side CHECK (side IN ('A', 'B'))
);

CREATE TABLE market_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE economic_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  odds_num integer NOT NULL,
  odds_den integer NOT NULL,
  streamer_commission_bps integer NOT NULL,
  platform_fee_bps integer NOT NULL,
  currency text NOT NULL,
  min_stake_minor bigint NOT NULL,
  max_stake_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ep_odds_positive CHECK (odds_num > 0 AND odds_den > 0),
  CONSTRAINT chk_ep_bps_range CHECK (
    streamer_commission_bps BETWEEN 0 AND 10000 AND platform_fee_bps BETWEEN 0 AND 10000
  ),
  CONSTRAINT chk_ep_stake_range CHECK (min_stake_minor > 0 AND min_stake_minor <= max_stake_minor),
  CONSTRAINT chk_ep_self_funding CHECK (
    odds_num * 10000 <= odds_den * (20000 - streamer_commission_bps - platform_fee_bps)
  )
);

CREATE TABLE streamers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_streamers_user_id ON streamers (user_id);

CREATE TABLE streamer_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id uuid NOT NULL REFERENCES streamers (id),
  platform text NOT NULL,
  channel_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_streamer_channels_streamer_id ON streamer_channels (streamer_id);

CREATE TABLE markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches (id),
  market_type_id uuid NOT NULL REFERENCES market_types (id),
  streamer_id uuid NOT NULL REFERENCES streamers (id),
  economic_profile_id uuid NOT NULL REFERENCES economic_profiles (id),
  status market_status NOT NULL DEFAULT 'DRAFT',
  closes_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_markets_match_id ON markets (match_id);
CREATE INDEX idx_markets_status ON markets (status);

CREATE TABLE outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets (id),
  code text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_outcomes_market_code UNIQUE (market_id, code)
);
CREATE INDEX idx_outcomes_market_id ON outcomes (market_id);
