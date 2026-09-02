import { z } from "zod";

export const createGameSchema = z
  .object({ slug: z.string().min(1), name: z.string().min(1) })
  .strict();

export const createGameModeBodySchema = z.object({ name: z.string().min(1) }).strict();

export const createTournamentSchema = z
  .object({
    gameId: z.uuid(),
    name: z.string().min(1),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullish(),
  })
  .strict();

export const createTeamSchema = z.object({ gameId: z.uuid(), name: z.string().min(1) }).strict();

export const createMatchSchema = z
  .object({
    tournamentId: z.uuid(),
    gameModeId: z.uuid(),
    scheduledAt: z.iso.datetime(),
  })
  .strict();

export const addMatchParticipantSchema = z
  .object({ teamId: z.uuid(), side: z.enum(["A", "B"]) })
  .strict();

export const createMarketTypeSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    outcomeCardinality: z.enum(["BINARY", "N_ARY"]),
  })
  .strict();

export const createEconomicProfileSchema = z
  .object({
    oddsNum: z.number().int().positive(),
    oddsDen: z.number().int().positive(),
    streamerCommissionBps: z.number().int().min(0),
    platformFeeBps: z.number().int().min(0),
    currency: z.string().min(1),
    minStakeMinor: z.string().regex(/^\d+$/),
    maxStakeMinor: z.string().regex(/^\d+$/),
  })
  .strict();

export const createStreamerSchema = z
  .object({
    userId: z.uuid(),
    displayName: z.string().min(1),
    defaultCommissionBps: z.number().int().min(0),
  })
  .strict();

export const updateStreamerCommissionSchema = z
  .object({ defaultCommissionBps: z.number().int().min(0) })
  .strict();

export const createStreamerChannelSchema = z
  .object({ platform: z.string().min(1), channelUrl: z.string().min(1) })
  .strict();

export const createMarketSchema = z
  .object({
    matchId: z.uuid(),
    marketTypeId: z.uuid(),
    streamerId: z.uuid(),
    economicProfileId: z.uuid(),
    closesAt: z.iso.datetime(),
    outcomes: z
      .array(z.object({ code: z.string().min(1), label: z.string().min(1) }).strict())
      .min(2),
  })
  .strict();

export const proposeResultSchema = z
  .object({
    winningOutcomeId: z.uuid().nullable(),
    rawPayload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const resolveDisputeSchema = z
  .object({
    winningOutcomeId: z.uuid().nullable(),
    rawPayload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const transitionMarketSchema = z
  .object({
    to: z.enum([
      "DRAFT",
      "OPEN",
      "SUSPENDED",
      "CLOSED",
      "SETTLING",
      "SETTLED",
      "CANCELLED",
      "VOID",
    ]),
    manualClose: z.boolean().optional(),
    matchPlayed: z.boolean().optional(),
  })
  .strict();
