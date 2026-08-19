import { eq } from "drizzle-orm";
import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationToken,
  EmailVerificationTokenRepository,
} from "@/domain/ports";
import { emailVerificationTokens } from "../schema/identity";
import type { DbTx } from "../uow";

export class DrizzleEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateEmailVerificationTokenInput): Promise<EmailVerificationToken> {
    const [row] = await this.tx
      .insert(emailVerificationTokens)
      .values({
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!row) {
      throw new Error("insert into email_verification_tokens returned no row");
    }
    return toToken(row);
  }

  async findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    const [row] = await this.tx
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash));
    return row ? toToken(row) : null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.tx
      .update(emailVerificationTokens)
      .set({ usedAt })
      .where(eq(emailVerificationTokens.id, id));
  }
}

function toToken(row: typeof emailVerificationTokens.$inferSelect): EmailVerificationToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
  };
}
