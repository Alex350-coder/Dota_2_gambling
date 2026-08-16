import { and, eq } from "drizzle-orm";
import type { Wallet, WalletRepository } from "@/domain/ports";
import { wallets } from "../schema/wallet";
import type { DbTx } from "../uow";

/** Owner-scoped at construction — every query filters `WHERE user_id = ownerId` (RULE-D-owner). */
export class DrizzleWalletRepository implements WalletRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async findByCurrency(currency: string): Promise<Wallet | null> {
    const [row] = await this.tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, this.ownerId), eq(wallets.currency, currency)));

    if (!row) {
      return null;
    }

    return {
      userId: row.userId,
      currency: row.currency,
      availableMinor: row.availableMinor,
      lockedMinor: row.lockedMinor,
      version: row.version,
      updatedAt: row.updatedAt,
    };
  }
}
