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
