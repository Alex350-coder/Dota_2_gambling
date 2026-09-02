import type { UserRole } from "@/domain/ports";

export type Role = UserRole;

export type Action =
  | "session:revoke"
  | "session:list"
  | "user:suspend"
  | "user:read"
  | "mfa:manage"
  | "audit:read"
  | "catalog:manage"
  | "streamer:manage"
  | "market:manage"
  | "bet:place"
  | "bet:manage"
  | "result:manage";

export interface Actor {
  readonly roles: readonly Role[];
}

export interface Resource {
  readonly ownerId: string;
}

interface ActionRule {
  readonly roles: readonly Role[];
  /** True when non-owning roles may still act on any resource (e.g. ADMIN). */
  readonly anyOwner: readonly Role[];
}

const POLICY: Readonly<Record<Action, ActionRule>> = {
  "session:revoke": { roles: ["USER"], anyOwner: ["ADMIN"] },
  "session:list": { roles: ["USER"], anyOwner: ["ADMIN"] },
  "user:suspend": { roles: [], anyOwner: ["ADMIN"] },
  "user:read": { roles: ["USER"], anyOwner: ["ADMIN"] },
  // No anyOwner bypass: MFA enrollment/verify/disable is always self-service,
  // even for ADMIN (disable already requires re-proving the account password).
  "mfa:manage": { roles: ["USER"], anyOwner: [] },
  "audit:read": { roles: [], anyOwner: ["ADMIN", "AUDITOR"] },
  // Catalog entities (games, tournaments, teams, matches, market types,
  // economic profiles, markets, streamers) have no per-user owner — only
  // ADMIN may manage them.
  "catalog:manage": { roles: [], anyOwner: ["ADMIN"] },
  // Streamer catalog records (commission rate, channels) are admin-managed,
  // not self-service by the linked user — same shape as catalog:manage.
  "streamer:manage": { roles: [], anyOwner: ["ADMIN"] },
  // Markets and their outcomes/transitions are admin-managed, ownerless.
  "market:manage": { roles: [], anyOwner: ["ADMIN"] },
  // Result proposal/confirmation/dispute is admin-managed, ownerless — R-10's
  // interacted-actor guard is a separate, use-case-level check, not part of this table.
  "result:manage": { roles: [], anyOwner: ["ADMIN"] },
  // Placing/cancelling a bet is self-service; ADMIN may read/manage for support/audit but
  // never places or cancels a bet as another user.
  "bet:place": { roles: ["USER"], anyOwner: ["ADMIN"] },
  "bet:manage": { roles: ["USER"], anyOwner: ["ADMIN"] },
};

/**
 * Table-driven authorization (T-309). Owner-scoped actions are only granted
 * to `roles` when the actor is also the resource owner; roles listed in
 * `anyOwner` (e.g. ADMIN) bypass the ownership check entirely.
 */
export function can(actor: Actor, action: Action, resource: Resource, actorId: string): boolean {
  const rule = POLICY[action];

  if (actor.roles.some((role) => rule.anyOwner.includes(role))) {
    return true;
  }

  const isOwner = resource.ownerId === actorId;
  return isOwner && actor.roles.some((role) => rule.roles.includes(role));
}
