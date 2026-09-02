import type { AuditEventInput } from "@/domain/ports";

/**
 * Auth-specific event builders (T-314) so every identity mutation writes
 * exactly one `audit_events` row through the same shape, instead of each use
 * case hand-assembling `AuditEventInput` inline.
 */
export function userRegisteredEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "USER_REGISTERED",
    entityType: "user",
    entityId: userId,
  };
}

export function emailVerifiedEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "EMAIL_VERIFIED",
    entityType: "user",
    entityId: userId,
  };
}

export function loginSucceededEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "LOGIN_SUCCEEDED",
    entityType: "user",
    entityId: userId,
  };
}

export function sessionRevokedEvent(userId: string, sessionId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "SESSION_REVOKED",
    entityType: "session",
    entityId: sessionId,
  };
}

export function passwordResetEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "PASSWORD_RESET",
    entityType: "user",
    entityId: userId,
  };
}

export function mfaEnrolledEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "MFA_ENROLLED",
    entityType: "user",
    entityId: userId,
  };
}

export function mfaVerifiedEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "MFA_VERIFIED",
    entityType: "user",
    entityId: userId,
  };
}

export function mfaDisabledEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "MFA_DISABLED",
    entityType: "user",
    entityId: userId,
  };
}

export function mfaRecoveryCodeRedeemedEvent(userId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "MFA_RECOVERY_CODE_REDEEMED",
    entityType: "user",
    entityId: userId,
  };
}

/**
 * Catalog event builders (T-401, T-402). Every catalog admin mutation writes
 * exactly one `audit_events` row through the same shape (T-414).
 */
export function gameCreatedEvent(actorId: string, gameId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "GAME_CREATED",
    entityType: "game",
    entityId: gameId,
  };
}

export function gameModeCreatedEvent(actorId: string, gameModeId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "GAME_MODE_CREATED",
    entityType: "game_mode",
    entityId: gameModeId,
  };
}

export function tournamentCreatedEvent(actorId: string, tournamentId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "TOURNAMENT_CREATED",
    entityType: "tournament",
    entityId: tournamentId,
  };
}

export function teamCreatedEvent(actorId: string, teamId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "TEAM_CREATED",
    entityType: "team",
    entityId: teamId,
  };
}

export function matchCreatedEvent(actorId: string, matchId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "MATCH_CREATED",
    entityType: "match",
    entityId: matchId,
  };
}

/**
 * `match_participants` has no single-column id (its PK is the
 * `(match_id, team_id)` pair) and `audit_events.entity_id` is a `uuid`
 * column, so this event is keyed on `matchId` — `teamId` is recoverable via
 * `match_participants` itself, not stored redundantly in the audit row.
 */
export function matchParticipantAddedEvent(actorId: string, matchId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "MATCH_PARTICIPANT_ADDED",
    entityType: "match_participant",
    entityId: matchId,
  };
}

/** Catalog event builders (T-404, T-405). */
export function marketTypeCreatedEvent(actorId: string, marketTypeId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "MARKET_TYPE_CREATED",
    entityType: "market_type",
    entityId: marketTypeId,
  };
}

export function economicProfileCreatedEvent(
  actorId: string,
  economicProfileId: string,
): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "ECONOMIC_PROFILE_CREATED",
    entityType: "economic_profile",
    entityId: economicProfileId,
  };
}

/** Catalog event builders (T-409). */
export function streamerCreatedEvent(actorId: string, streamerId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "STREAMER_CREATED",
    entityType: "streamer",
    entityId: streamerId,
  };
}

export function streamerCommissionUpdatedEvent(
  actorId: string,
  streamerId: string,
): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "STREAMER_COMMISSION_UPDATED",
    entityType: "streamer",
    entityId: streamerId,
  };
}

export function streamerChannelCreatedEvent(
  actorId: string,
  streamerChannelId: string,
): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "STREAMER_CHANNEL_CREATED",
    entityType: "streamer_channel",
    entityId: streamerChannelId,
  };
}

/** Catalog event builders (T-406). */
export function marketCreatedEvent(actorId: string, marketId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "MARKET_CREATED",
    entityType: "market",
    entityId: marketId,
  };
}

/** Catalog event builders (T-407, T-408). `actorId` is `null` for scheduler-driven transitions. */
export function marketStatusChangedEvent(
  actorId: string | null,
  marketId: string,
): AuditEventInput {
  return {
    actorType: actorId === null ? "system" : "user",
    actorId,
    action: "MARKET_STATUS_CHANGED",
    entityType: "market",
    entityId: marketId,
  };
}

/**
 * Betting event builders (T-502, T-510, T-511). Every betting audit event carries the ledger
 * transaction id it resulted in (T-519), so a reviewer can jump from an audit row straight to
 * the exact `ledger_transactions`/`ledger_entries` rows the mutation posted.
 */
export function betPlacedEvent(
  userId: string,
  orderId: string,
  ledgerTransactionId: string,
): AuditEventInput {
  return {
    actorType: "user",
    actorId: userId,
    action: "BET_PLACED",
    entityType: "bet_order",
    entityId: orderId,
    after: { ledgerTransactionId },
  };
}

/**
 * `actorId` is `null` for system-driven cancellations (e.g. market-close release).
 * `ledgerTransactionId` is `undefined` when there was nothing left to refund (the order had no
 * unmatched stake), so cancelling it posted no ledger transaction at all.
 */
/**
 * Results & settlement event builders (T-602). `resultId` is the `market_results` row's own
 * id — `marketId` is recoverable from that row, not stored redundantly on the audit entry.
 */
export function resultProposedEvent(actorId: string, resultId: string): AuditEventInput {
  return {
    actorType: "user",
    actorId,
    action: "RESULT_PROPOSED",
    entityType: "market_result",
    entityId: resultId,
  };
}

export function betCancelledEvent(
  actorId: string | null,
  orderId: string,
  ledgerTransactionId?: string,
): AuditEventInput {
  return {
    actorType: actorId === null ? "system" : "user",
    actorId,
    action: "BET_CANCELLED",
    entityType: "bet_order",
    entityId: orderId,
    after: ledgerTransactionId ? { ledgerTransactionId } : null,
  };
}
