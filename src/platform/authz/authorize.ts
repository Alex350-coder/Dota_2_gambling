import type { Action, Resource } from "@/domain/identity";
import { assertActiveAccount, can } from "@/domain/identity";
import { DomainError } from "@/domain/errors";
import type {
  SessionRecord,
  UnitOfWork,
  UserRepository,
  UserRole,
  UserRoleRepository,
} from "@/domain/ports";
import type { SessionService } from "@/platform/session";

export interface AuthorizeDeps<Tx> {
  readonly sessionService: SessionService<Tx>;
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly userRoles: (tx: Tx) => UserRoleRepository;
}

export interface AuthorizeInput {
  readonly token: string | undefined;
  readonly action: Action;
  readonly resource: Resource;
}

export interface AuthorizeResult {
  readonly userId: string;
  readonly roles: readonly UserRole[];
  readonly session: SessionRecord;
}

/**
 * The single entry point every src/app/api/** route must call by name
 * (enforced by tooling/eslint-rules/require-authz.cjs). Validates the session
 * token, blocks non-ACTIVE accounts (T-315), and applies the role policy
 * (T-309) before returning the caller's identity to the route.
 */
export async function authorize<Tx>(
  deps: AuthorizeDeps<Tx>,
  input: AuthorizeInput,
): Promise<AuthorizeResult> {
  if (!input.token) {
    throw new DomainError("UNAUTHENTICATED", "no session token provided");
  }

  const session = await deps.sessionService.validateSession(input.token);

  const user = await deps.uow.run((tx) => deps.users(tx).findById(session.userId));
  if (!user) {
    throw new DomainError("UNAUTHENTICATED", "session does not resolve to a known user");
  }
  assertActiveAccount(user.status);

  const grantedRoles = await deps.uow.run((tx) => deps.userRoles(tx).listRolesForUser(user.id));
  const roles: readonly UserRole[] = grantedRoles.length > 0 ? grantedRoles : ["USER"];

  if (!can({ roles }, input.action, input.resource, user.id)) {
    throw new DomainError(
      "UNAUTHORIZED_OPERATION",
      "actor is not permitted to perform this action",
    );
  }

  return { userId: user.id, roles, session };
}
