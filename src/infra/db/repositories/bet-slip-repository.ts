import { DomainError } from "@/domain/errors";
import type { BetSlip, BetSlipRepository, CreateBetSlipInput } from "@/domain/ports";
import { betSlips } from "../schema/betting";
import type { DbTx } from "../uow";

/** Owner-scoped at construction — every write is filtered/verified against `ownerId`. */
export class DrizzleBetSlipRepository implements BetSlipRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async create(input: CreateBetSlipInput): Promise<BetSlip> {
    if (input.userId !== this.ownerId) {
      throw new DomainError(
        "UNAUTHORIZED_OPERATION",
        "cannot create a bet slip owned by a different user",
        { details: { ownerId: this.ownerId, entityUserId: input.userId } },
      );
    }

    const [row] = await this.tx
      .insert(betSlips)
      .values({ id: input.id, userId: input.userId, createdAt: input.createdAt })
      .returning();

    if (!row) {
      throw new Error("bet slip insert returned no row");
    }

    return { id: row.id, userId: row.userId, createdAt: row.createdAt };
  }
}
