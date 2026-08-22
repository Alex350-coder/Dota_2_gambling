import { DomainError } from "@/domain/errors";
import type { Action } from "@/domain/identity";
import { authorize, type AuthorizeDeps, type AuthorizeResult } from "@/platform/authz";
import type { SessionService } from "@/platform/session";

export type SelfAuthorizeContainer<Tx> = AuthorizeDeps<Tx> & { sessionService: SessionService<Tx> };

/**
 * Every account-scoped route (logout, MFA management, /me, /me/sessions) is
 * always acting on the *caller's own* resource — the owner id isn't known
 * until the session is resolved, so this resolves it once and feeds it back
 * into authorize()'s owner-scoped policy check (T-309/T-310).
 */
export async function authorizeSelf<Tx>(
  container: SelfAuthorizeContainer<Tx>,
  token: string | undefined,
  action: Action,
): Promise<AuthorizeResult> {
  if (!token) {
    throw new DomainError("UNAUTHENTICATED", "no session token provided");
  }
  const session = await container.sessionService.validateSession(token);
  return authorize(container, { token, action, resource: { ownerId: session.userId } });
}
