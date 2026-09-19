import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { DrizzleEmailVerificationTokenRepository } from "@/infra/db/repositories/email-verification-token-repository";
import { OutboxMailProvider } from "@/infra/mail/outbox-mail-provider";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { Argon2PasswordHasher } from "@/infra/crypto/password";
import { SessionService } from "@/platform/session/service";
import { RegisterUseCase } from "@/application/identity/register";
import { ChangePasswordUseCase } from "@/application/identity/change-password";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("ChangePasswordUseCase (T-802)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const passwordHasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const mail = new OutboxMailProvider();
  const audit = new DrizzleAuditWriter();
  const users = (tx: DbTx) => new DrizzleUserRepository(tx);
  const sessions = (tx: DbTx) => new DrizzleSessionRepository(tx);

  const register = new RegisterUseCase<DbTx>({
    uow,
    users,
    verificationTokens: (tx: DbTx) => new DrizzleEmailVerificationTokenRepository(tx),
    passwordHasher,
    mail,
    ids,
    clock,
    audit,
  });

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions,
    ids,
    clock,
    config: { ttlHours: 720, idleTimeoutHours: 168 },
  });

  const changePassword = new ChangePasswordUseCase<DbTx>({
    uow,
    users,
    sessions,
    passwordHasher,
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
    return `changepw-${randomUUID()}@example.test`;
  }

  async function registeredUser(): Promise<{ userId: string; email: string }> {
    const email = uniqueEmail();
    const { userId } = await register.execute({
      email,
      password: "the-original-passphrase-1",
      dateOfBirth: "1990-01-01",
    });
    return { userId, email };
  }

  it("changes the password and revokes every other session", async () => {
    const { userId } = await registeredUser();
    const { token: keptToken, session: keptSession } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });
    const { token: otherToken } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });

    await changePassword.execute({
      userId,
      currentPassword: "the-original-passphrase-1",
      newPassword: "a-brand-new-passphrase-99",
      exceptSessionId: keptSession.id,
    });

    const userRow = await pool
      .query("SELECT password_hash FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { password_hash: string });
    expect(await passwordHasher.verify(userRow.password_hash, "a-brand-new-passphrase-99")).toBe(
      true,
    );

    await expect(sessionService.validateSession(keptToken)).resolves.toBeDefined();
    await expect(sessionService.validateSession(otherToken)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("rejects an incorrect current password without changing anything", async () => {
    const { userId } = await registeredUser();
    const { session } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    await expect(
      changePassword.execute({
        userId,
        currentPassword: "not-the-right-password",
        newPassword: "a-brand-new-passphrase-88",
        exceptSessionId: session.id,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    const userRow = await pool
      .query("SELECT password_hash FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { password_hash: string });
    expect(await passwordHasher.verify(userRow.password_hash, "the-original-passphrase-1")).toBe(
      true,
    );
  });

  it("rejects a weak new password", async () => {
    const { userId } = await registeredUser();
    const { session } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    await expect(
      changePassword.execute({
        userId,
        currentPassword: "the-original-passphrase-1",
        newPassword: "short",
        exceptSessionId: session.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("emits exactly one PASSWORD_CHANGED audit event", async () => {
    const { userId } = await registeredUser();
    const { session } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    await changePassword.execute({
      userId,
      currentPassword: "the-original-passphrase-1",
      newPassword: "a-brand-new-passphrase-77",
      exceptSessionId: session.id,
    });

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'PASSWORD_CHANGED'",
        [userId],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });
});
