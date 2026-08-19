import { eq } from "drizzle-orm";
import type {
  CreatePasswordResetTokenInput,
  PasswordResetToken,
  PasswordResetTokenRepository,
} from "@/domain/ports";
import { passwordResetTokens } from "../schema/identity";
import type { DbTx } from "../uow";

export class DrizzlePasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken> {
    const [row] = await this.tx
      .insert(passwordResetTokens)
      .values({
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!row) {
      throw new Error("insert into password_reset_tokens returned no row");
    }
    return toToken(row);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const [row] = await this.tx
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    return row ? toToken(row) : null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.tx.update(passwordResetTokens).set({ usedAt }).where(eq(passwordResetTokens.id, id));
  }
}

function toToken(row: typeof passwordResetTokens.$inferSelect): PasswordResetToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
  };
}
