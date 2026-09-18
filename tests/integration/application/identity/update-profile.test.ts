import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleEmailVerificationTokenRepository } from "@/infra/db/repositories/email-verification-token-repository";
import { OutboxMailProvider } from "@/infra/mail/outbox-mail-provider";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { Argon2PasswordHasher } from "@/infra/crypto/password";
import { RegisterUseCase } from "@/application/identity/register";
import { UpdateProfileUseCase } from "@/application/identity/update-profile";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("UpdateProfileUseCase (T-801)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const passwordHasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const mail = new OutboxMailProvider();
  const audit = new DrizzleAuditWriter();
  const users = (tx: DbTx) => new DrizzleUserRepository(tx);
  const verificationTokens = (tx: DbTx) => new DrizzleEmailVerificationTokenRepository(tx);

  const register = new RegisterUseCase<DbTx>({
    uow,
    users,
    verificationTokens,
    passwordHasher,
    mail,
    ids,
    clock,
    audit,
  });

  const updateProfile = new UpdateProfileUseCase<DbTx>({
    uow,
    users,
    verificationTokens,
    mail,
    ids,
    clock,
    audit,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  function uniqueEmail(): string {
    return `profile-${randomUUID()}@example.test`;
  }

  async function registerActiveUser(): Promise<{ userId: string; email: string }> {
    const email = uniqueEmail();
    const { userId } = await register.execute({
      email,
      password: "a-strong-passphrase-42",
      dateOfBirth: "1990-01-01",
    });
    await pool.query(
      "UPDATE users SET status = 'ACTIVE', email_verified_at = now() WHERE id = $1",
      [userId],
    );
    return { userId, email };
  }

  it("changes the email, clears verification, and issues a new verification email", async () => {
    const { userId } = await registerActiveUser();
    const newEmail = uniqueEmail();

    const result = await updateProfile.execute({ userId, email: newEmail });

    expect(result.email).toBe(newEmail);
    expect(result.emailVerifiedAt).toBeNull();

    const userRow = await pool
      .query("SELECT email, email_verified_at, status FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0]);
    expect(userRow.email).toBe(newEmail);
    expect(userRow.email_verified_at).toBeNull();
    // Status stays ACTIVE — re-verification is required only to keep signing in with the
    // new address, it does not lock the account out (UpdateProfileUseCase, T-801).
    expect(userRow.status).toBe("ACTIVE");

    const outboxRow = await pool
      .query(
        "SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1 ORDER BY created_at DESC LIMIT 1",
        [newEmail],
      )
      .then((r) => r.rows[0]);
    expect(outboxRow).toBeDefined();
    expect(outboxRow.payload.template).toBe("verify-email");
  });

  it("is a no-op when the email is unchanged and sends no verification email", async () => {
    const { userId, email } = await registerActiveUser();

    const result = await updateProfile.execute({ userId, email });

    expect(result.email).toBe(email);
    expect(result.emailVerifiedAt).not.toBeNull();

    const outboxCount = await pool
      .query(
        "SELECT count(*)::int AS count FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1",
        [email],
      )
      .then((r) => r.rows[0].count as number);
    // Exactly the one email register() sent — none added by the no-op update.
    expect(outboxCount).toBe(1);
  });

  it("rejects an email already registered to another account", async () => {
    const { email: takenEmail } = await registerActiveUser();
    const { userId } = await registerActiveUser();

    await expect(updateProfile.execute({ userId, email: takenEmail })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("emits exactly one PROFILE_EMAIL_CHANGE_REQUESTED audit event", async () => {
    const { userId } = await registerActiveUser();

    await updateProfile.execute({ userId, email: uniqueEmail() });

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'PROFILE_EMAIL_CHANGE_REQUESTED'",
        [userId],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });
});
