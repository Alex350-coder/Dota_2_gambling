import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { DrizzlePasswordResetTokenRepository } from "@/infra/db/repositories/password-reset-token-repository";
import { OutboxMailProvider } from "@/infra/mail/outbox-mail-provider";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { Argon2PasswordHasher } from "@/infra/crypto/password";
import { SessionService } from "@/platform/session/service";
import { RegisterUseCase } from "@/application/identity/register";
import { DrizzleEmailVerificationTokenRepository } from "@/infra/db/repositories/email-verification-token-repository";
import { ForgotPasswordUseCase } from "@/application/identity/forgot-password";
import { ResetPasswordUseCase } from "@/application/identity/reset-password";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("forgot-password + reset-password", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const mail = new OutboxMailProvider();
  const passwordHasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });

  const register = new RegisterUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    verificationTokens: (tx) => new DrizzleEmailVerificationTokenRepository(tx),
    passwordHasher,
    mail,
    ids,
    clock,
  });

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions: (tx) => new DrizzleSessionRepository(tx),
    ids,
    clock,
    config: { ttlHours: 720, idleTimeoutHours: 168 },
  });

  const forgotPassword = new ForgotPasswordUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    resetTokens: (tx) => new DrizzlePasswordResetTokenRepository(tx),
    mail,
    ids,
    clock,
  });

  const resetPassword = new ResetPasswordUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    resetTokens: (tx) => new DrizzlePasswordResetTokenRepository(tx),
    sessions: (tx) => new DrizzleSessionRepository(tx),
    passwordHasher,
    clock,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  function uniqueEmail(): string {
    return `reset-${randomUUID()}@example.test`;
  }

  async function registeredUser(): Promise<{ userId: string; email: string }> {
    const email = uniqueEmail();
    const { userId } = await register.execute({
      email,
      password: "a-strong-passphrase-42",
      dateOfBirth: "1990-01-01",
    });
    return { userId, email };
  }

  async function captureResetToken(email: string): Promise<string> {
    const outboxRow = await pool
      .query(
        "SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1 AND payload->>'template' = 'reset-password' ORDER BY created_at DESC LIMIT 1",
        [email],
      )
      .then((r) => r.rows[0]);
    return outboxRow.payload.data.token as string;
  }

  it("always resolves for forgot-password, whether or not the email exists", async () => {
    const { email } = await registeredUser();

    await expect(forgotPassword.execute({ email })).resolves.toBeUndefined();
    await expect(
      forgotPassword.execute({ email: "unknown-nobody@example.test" }),
    ).resolves.toBeUndefined();
  });

  it("only writes a reset token to the outbox for an existing email", async () => {
    const { email } = await registeredUser();
    const unknownEmail = "no-such-account@example.test";

    await forgotPassword.execute({ email });
    await forgotPassword.execute({ email: unknownEmail });

    const knownRow = await pool
      .query("SELECT 1 FROM outbox WHERE payload->>'to' = $1", [email])
      .then((r) => r.rows[0]);
    const unknownRow = await pool
      .query("SELECT 1 FROM outbox WHERE payload->>'to' = $1", [unknownEmail])
      .then((r) => r.rows[0]);

    expect(knownRow).toBeDefined();
    expect(unknownRow).toBeUndefined();
  });

  it("resets the password and revokes all sessions", async () => {
    const { userId, email } = await registeredUser();
    const { token: sessionToken } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });

    await forgotPassword.execute({ email });
    const resetToken = await captureResetToken(email);

    await resetPassword.execute({ token: resetToken, newPassword: "a-brand-new-passphrase-1" });

    const userRow = await pool
      .query("SELECT password_hash FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { password_hash: string });
    expect(await passwordHasher.verify(userRow.password_hash, "a-brand-new-passphrase-1")).toBe(
      true,
    );

    await expect(sessionService.validateSession(sessionToken)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("rejects a reused reset token", async () => {
    const { email } = await registeredUser();
    await forgotPassword.execute({ email });
    const resetToken = await captureResetToken(email);

    await resetPassword.execute({ token: resetToken, newPassword: "first-reset-passphrase-1" });

    await expect(
      resetPassword.execute({ token: resetToken, newPassword: "second-reset-passphrase-1" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects an expired reset token", async () => {
    const { userId, email } = await registeredUser();
    await forgotPassword.execute({ email });
    const resetToken = await captureResetToken(email);

    await pool.query(
      "UPDATE password_reset_tokens SET expires_at = now() - interval '1 hour' WHERE user_id = $1",
      [userId],
    );

    await expect(
      resetPassword.execute({ token: resetToken, newPassword: "expired-reset-passphrase-1" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects an unknown reset token", async () => {
    await expect(
      resetPassword.execute({ token: "not-a-real-token", newPassword: "whatever-passphrase-1" }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("rejects a weak new password without consuming the token", async () => {
    const { email } = await registeredUser();
    await forgotPassword.execute({ email });
    const resetToken = await captureResetToken(email);

    await expect(
      resetPassword.execute({ token: resetToken, newPassword: "short" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await expect(
      resetPassword.execute({ token: resetToken, newPassword: "a-perfectly-fine-passphrase-1" }),
    ).resolves.toBeUndefined();
  });
});
