import { and, eq, isNull } from "drizzle-orm";
import type {
  CreateMfaRecoveryCodeInput,
  MfaRecoveryCode,
  MfaRecoveryCodeRepository,
} from "@/domain/ports";
import { mfaRecoveryCodes } from "../schema/identity";
import type { DbTx } from "../uow";

export class DrizzleMfaRecoveryCodeRepository implements MfaRecoveryCodeRepository {
  constructor(private readonly tx: DbTx) {}

  async createMany(inputs: readonly CreateMfaRecoveryCodeInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    await this.tx.insert(mfaRecoveryCodes).values(
      inputs.map((input) => ({
        id: input.id,
        userId: input.userId,
        codeHash: input.codeHash,
        createdAt: input.createdAt,
      })),
    );
  }

  async findUnusedByUserAndCodeHash(
    userId: string,
    codeHash: string,
  ): Promise<MfaRecoveryCode | null> {
    const [row] = await this.tx
      .select()
      .from(mfaRecoveryCodes)
      .where(
        and(
          eq(mfaRecoveryCodes.userId, userId),
          eq(mfaRecoveryCodes.codeHash, codeHash),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      );
    return row ? toRecoveryCode(row) : null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.tx.update(mfaRecoveryCodes).set({ usedAt }).where(eq(mfaRecoveryCodes.id, id));
  }

  async markAllUsedForUser(userId: string, usedAt: Date): Promise<void> {
    await this.tx
      .update(mfaRecoveryCodes)
      .set({ usedAt })
      .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
  }
}

function toRecoveryCode(row: typeof mfaRecoveryCodes.$inferSelect): MfaRecoveryCode {
  return {
    id: row.id,
    userId: row.userId,
    codeHash: row.codeHash,
    createdAt: row.createdAt,
    usedAt: row.usedAt,
  };
}
