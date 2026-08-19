import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleEmailVerificationTokenRepository } from "@/infra/db/repositories/email-verification-token-repository";
import { OutboxMailProvider } from "@/infra/mail/outbox-mail-provider";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { Argon2PasswordHasher } from "@/infra/crypto/password";
import { RegisterUseCase } from "@/application/identity/register";
import { VerifyEmailUseCase } from "@/application/identity/verify-email";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("register + verify-email", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const passwordHasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const mail = new OutboxMailProvider();

  const register = new RegisterUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    verificationTokens: (tx) => new DrizzleEmailVerificationTokenRepository(tx),
    passwordHasher,
    mail,
    ids,
    clock,
  });

  const verifyEmail = new VerifyEmailUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    verificationTokens: (tx) => new DrizzleEmailVerificationTokenRepository(tx),
    clock,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  function uniqueEmail(): string {
    return `register-${randomUUID()}@example.test`;
  }

  it("rejects registration under 18 with AGE_REQUIREMENT_NOT_MET and never creates the account", async () => {
    const email = uniqueEmail();

    await expect(
      register.execute({
        email,
        password: "a-strong-passphrase-42",
        dateOfBirth: "2015-01-01",
      }),
    ).rejects.toMatchObject({ code: "AGE_REQUIREMENT_NOT_MET" });

    const [row] = await pool
      .query("SELECT 1 FROM users WHERE email = $1", [email])
      .then((r) => r.rows);
    expect(row).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail();
    await register.execute({
      email,
      password: "a-strong-passphrase-42",
      dateOfBirth: "1990-01-01",
    });

    await expect(
      register.execute({ email, password: "a-different-passphrase-9", dateOfBirth: "1990-01-01" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("registers a user as PENDING_VERIFICATION and writes a verification email to the outbox", async () => {
    const email = uniqueEmail();

    const { userId } = await register.execute({
      email,
      password: "a-strong-passphrase-42",
      dateOfBirth: "1990-01-01",
    });

    const userRow = await pool
      .query("SELECT status, email_verified_at FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0]);
    expect(userRow.status).toBe("PENDING_VERIFICATION");
    expect(userRow.email_verified_at).toBeNull();

    const outboxRow = await pool
      .query("SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1", [email])
      .then((r) => r.rows[0]);
    expect(outboxRow).toBeDefined();
    expect(outboxRow.payload.template).toBe("verify-email");
  });

  it("verifies email and flips the account to ACTIVE", async () => {
    const email = uniqueEmail();
    const tokenHash = await captureVerificationToken(email);

    await verifyEmail.execute({ token: tokenHash.token });

    const userRow = await pool
      .query("SELECT status, email_verified_at FROM users WHERE id = $1", [tokenHash.userId])
      .then((r) => r.rows[0]);
    expect(userRow.status).toBe("ACTIVE");
    expect(userRow.email_verified_at).not.toBeNull();
  });

  it("rejects a reused verification token", async () => {
    const email = uniqueEmail();
    const { token } = await captureVerificationToken(email);

    await verifyEmail.execute({ token });

    await expect(verifyEmail.execute({ token })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("rejects an expired verification token", async () => {
    const email = uniqueEmail();
    const { userId, token } = await captureVerificationToken(email);

    await pool.query(
      "UPDATE email_verification_tokens SET expires_at = now() - interval '1 hour' WHERE user_id = $1",
      [userId],
    );

    await expect(verifyEmail.execute({ token })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("rejects an unknown token", async () => {
    await expect(verifyEmail.execute({ token: "not-a-real-token" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("throws DomainError instances (not raw errors) on invalid input", async () => {
    await expect(
      register.execute({ email: uniqueEmail(), password: "short", dateOfBirth: "1990-01-01" }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  async function captureVerificationToken(
    email: string,
  ): Promise<{ userId: string; token: string }> {
    // The DB only ever stores the token hash, so the only way to get the raw token
    // is to read it back from the outbox row register() just wrote.
    const { userId } = await register.execute({
      email,
      password: "a-strong-passphrase-42",
      dateOfBirth: "1990-01-01",
    });

    const outboxRow = await pool
      .query(
        "SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1 ORDER BY created_at DESC LIMIT 1",
        [email],
      )
      .then((r) => r.rows[0]);

    return { userId, token: outboxRow.payload.data.token as string };
  }
});
