import { DomainError } from "@/domain/errors";
import type {
  Clock,
  IdGenerator,
  SessionRecord,
  SessionRepository,
  UnitOfWork,
} from "@/domain/ports";
import { generateOpaqueToken, hashIdentifier, hashToken } from "@/platform/crypto";

const HOUR_MS = 60 * 60 * 1000;

interface SessionServiceConfig {
  /** Absolute lifetime from creation (Security.md §5: 30 days). */
  readonly ttlHours: number;
  /** Maximum gap between requests before a session is treated as expired (7 days). */
  readonly idleTimeoutHours: number;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface CreatedSession {
  readonly token: string;
  readonly session: SessionRecord;
}

export interface SessionServiceDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly config: SessionServiceConfig;
}

/**
 * Opaque session issuance/validation (T-305). The raw token only ever exists in
 * memory and in the response cookie — everything persisted is its SHA-256 hash
 * (Security.md §5). See src/platform/session/cookie.ts for the cookie flags.
 */
export class SessionService<Tx> {
  constructor(private readonly deps: SessionServiceDeps<Tx>) {}

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const token = generateOpaqueToken();
    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + this.deps.config.ttlHours * HOUR_MS);

    const session = await this.deps.uow.run((tx) =>
      this.deps.sessions(tx).create({
        id: this.deps.ids.next(),
        userId: input.userId,
        tokenHash: hashToken(token),
        ipHash: input.ip === null ? null : hashIdentifier(input.ip),
        userAgent: input.userAgent,
        createdAt: now,
        expiresAt,
      }),
    );

    return { token, session };
  }

  /**
   * Throws UNAUTHENTICATED for a token that doesn't resolve to any session, and
   * SESSION_EXPIRED for one that resolved but is no longer usable (revoked, past
   * its absolute lifetime, or idle past the timeout) — callers rely on this
   * distinction to decide whether to prompt for re-login vs. just refresh.
   */
  async validateSession(token: string): Promise<SessionRecord> {
    const tokenHash = hashToken(token);
    const now = this.deps.clock.now();

    const session = await this.deps.uow.run((tx) =>
      this.deps.sessions(tx).findByTokenHash(tokenHash),
    );
    if (!session) {
      throw new DomainError("UNAUTHENTICATED", "no session found for this token");
    }

    const idleDeadline = session.lastSeenAt.getTime() + this.deps.config.idleTimeoutHours * HOUR_MS;
    const isRevoked = session.revokedAt !== null;
    const isPastAbsoluteLifetime = session.expiresAt.getTime() < now.getTime();
    const isPastIdleTimeout = idleDeadline < now.getTime();

    if (isRevoked || isPastAbsoluteLifetime || isPastIdleTimeout) {
      throw new DomainError("SESSION_EXPIRED", "session is no longer valid");
    }

    return session;
  }

  async touchSession(sessionId: string): Promise<void> {
    const now = this.deps.clock.now();
    await this.deps.uow.run((tx) => this.deps.sessions(tx).touch(sessionId, now));
  }

  async revokeSession(sessionId: string): Promise<void> {
    const now = this.deps.clock.now();
    await this.deps.uow.run((tx) => this.deps.sessions(tx).revoke(sessionId, now));
  }
}
