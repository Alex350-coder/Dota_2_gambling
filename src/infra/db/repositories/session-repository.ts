import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { CreateSessionInput, SessionRecord, SessionRepository } from "@/domain/ports";
import { sessions } from "../schema/identity";
import type { DbTx } from "../uow";

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const [row] = await this.tx
      .insert(sessions)
      .values({
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
        createdAt: input.createdAt,
        lastSeenAt: input.createdAt,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!row) {
      throw new Error("insert into sessions returned no row");
    }
    return toSessionRecord(row);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const [row] = await this.tx.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return row ? toSessionRecord(row) : null;
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const [row] = await this.tx.select().from(sessions).where(eq(sessions.id, id));
    return row ? toSessionRecord(row) : null;
  }

  async listActiveByUserId(userId: string, now: Date): Promise<readonly SessionRecord[]> {
    const rows = await this.tx
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
      );
    return rows.map(toSessionRecord);
  }

  async touch(id: string, lastSeenAt: Date): Promise<void> {
    await this.tx.update(sessions).set({ lastSeenAt }).where(eq(sessions.id, id));
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    await this.tx.update(sessions).set({ revokedAt }).where(eq(sessions.id, id));
  }

  async revokeAllForUser(userId: string, revokedAt: Date, exceptSessionId?: string): Promise<void> {
    const scope = exceptSessionId
      ? and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          ne(sessions.id, exceptSessionId),
        )
      : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
    await this.tx.update(sessions).set({ revokedAt }).where(scope);
  }
}

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}
