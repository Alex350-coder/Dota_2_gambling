import { eq } from "drizzle-orm";
import type { CreateUserInput, UserRecord, UserRepository } from "@/domain/ports";
import { users } from "../schema/identity";
import type { DbTx } from "../uow";

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly tx: DbTx) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.tx.select().from(users).where(eq(users.email, email));
    return row ? toUserRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.tx.select().from(users).where(eq(users.id, id));
    return row ? toUserRecord(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const [row] = await this.tx
      .insert(users)
      .values({
        id: input.id,
        email: input.email,
        passwordHash: input.passwordHash,
        dateOfBirth: input.dateOfBirth,
      })
      .returning();

    if (!row) {
      throw new Error("insert into users returned no row");
    }
    return toUserRecord(row);
  }

  async activate(userId: string, verifiedAt: Date): Promise<void> {
    await this.tx
      .update(users)
      .set({ status: "ACTIVE", emailVerifiedAt: verifiedAt, updatedAt: verifiedAt })
      .where(eq(users.id, userId));
  }

  async updatePasswordHash(userId: string, passwordHash: string, updatedAt: Date): Promise<void> {
    await this.tx.update(users).set({ passwordHash, updatedAt }).where(eq(users.id, userId));
  }
}

function toUserRecord(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    status: row.status,
    dateOfBirth: row.dateOfBirth,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
  };
}
