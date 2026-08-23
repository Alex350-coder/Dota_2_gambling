import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const marketStatus = pgEnum("market_status", [
  "DRAFT",
  "OPEN",
  "SUSPENDED",
  "CLOSED",
  "SETTLING",
  "SETTLED",
  "CANCELLED",
  "VOID",
]);

export const outcomeCardinality = pgEnum("outcome_cardinality", ["BINARY", "N_ARY"]);

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameModes = pgTable(
  "game_modes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_game_modes_game_id").on(table.gameId)],
);

export const tournaments = pgTable(
  "tournaments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_tournaments_game_id").on(table.gameId)],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_teams_game_id").on(table.gameId)],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    gameModeId: uuid("game_mode_id")
      .notNull()
      .references(() => gameModes.id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    playedAt: timestamp("played_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_matches_tournament_id").on(table.tournamentId)],
);

export const matchParticipants = pgTable(
  "match_participants",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    side: text("side").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.teamId] })],
);

export const marketTypes = pgTable("market_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  outcomeCardinality: outcomeCardinality("outcome_cardinality").notNull().default("BINARY"),
});

export const economicProfiles = pgTable("economic_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  oddsNum: integer("odds_num").notNull(),
  oddsDen: integer("odds_den").notNull(),
  streamerCommissionBps: integer("streamer_commission_bps").notNull(),
  platformFeeBps: integer("platform_fee_bps").notNull(),
  currency: text("currency").notNull(),
  minStakeMinor: bigint("min_stake_minor", { mode: "bigint" }).notNull(),
  maxStakeMinor: bigint("max_stake_minor", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const streamers = pgTable(
  "streamers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_streamers_user_id").on(table.userId)],
);

export const streamerChannels = pgTable(
  "streamer_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    streamerId: uuid("streamer_id")
      .notNull()
      .references(() => streamers.id),
    platform: text("platform").notNull(),
    channelUrl: text("channel_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_streamer_channels_streamer_id").on(table.streamerId)],
);

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    marketTypeId: uuid("market_type_id")
      .notNull()
      .references(() => marketTypes.id),
    streamerId: uuid("streamer_id")
      .notNull()
      .references(() => streamers.id),
    economicProfileId: uuid("economic_profile_id")
      .notNull()
      .references(() => economicProfiles.id),
    status: marketStatus("status").notNull().default("DRAFT"),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_markets_match_id").on(table.matchId),
    index("idx_markets_status").on(table.status),
  ],
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    code: text("code").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_outcomes_market_id").on(table.marketId),
    unique("uq_outcomes_market_code").on(table.marketId, table.code),
  ],
);
