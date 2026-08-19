import { and, count, eq, gte, isNull } from "drizzle-orm";
import type { LoginAttemptRepository, RecordLoginAttemptInput } from "@/domain/ports";
import { loginAttempts } from "../schema/identity";
import type { DbTx } from "../uow";

export class DrizzleLoginAttemptRepository implements LoginAttemptRepository {
  constructor(private readonly tx: DbTx) {}

  async record(input: RecordLoginAttemptInput): Promise<void> {
    await this.tx.insert(loginAttempts).values({
      emailHash: input.emailHash,
      ipHash: input.ipHash,
      succeeded: input.succeeded,
    });
  }

  async countRecentFailures(
    emailHash: string,
    ipHash: string | null,
    since: Date,
  ): Promise<number> {
    const ipCondition =
      ipHash === null ? isNull(loginAttempts.ipHash) : eq(loginAttempts.ipHash, ipHash);

    const [row] = await this.tx
      .select({ value: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.emailHash, emailHash),
          ipCondition,
          eq(loginAttempts.succeeded, false),
          gte(loginAttempts.createdAt, since),
        ),
      );

    return row?.value ?? 0;
  }
}
