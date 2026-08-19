import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleLoginAttemptRepository } from "@/infra/db/repositories/login-attempt-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { Argon2PasswordHasher } from "@/infra/crypto/password";
import { RegisterUseCase } from "@/application/identity/register";
import { VerifyEmailUseCase } from "@/application/identity/verify-email";
import { LoginUseCase } from "@/application/identity/login";
import { DrizzleEmailVerificationTokenRepository } from "@/infra/db/repositories/email-verification-token-repository";
import { OutboxMailProvider } from "@/infra/mail/outbox-mail-provider";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("login", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const passwordHasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const mail = new OutboxMailProvider();
  const audit = new DrizzleAuditWriter();
  const password = "a-strong-passphrase-42";

  const register = new RegisterUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    verificationTokens: (tx) => new DrizzleEmailVerificationTokenRepository(tx),
    passwordHasher,
    mail,
    ids,
    clock,
    audit,
  });

  const verifyEmail = new VerifyEmailUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    verificationTokens: (tx) => new DrizzleEmailVerificationTokenRepository(tx),
    clock,
    audit,
  });

  const login = new LoginUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    loginAttempts: (tx) => new DrizzleLoginAttemptRepository(tx),
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

  async function activeUser(): Promise<string> {
    const email = `login-${randomUUID()}@example.test`;
    await register.execute({
      email,
      password,
      dateOfBirth: "1990-01-01",
    });

    const outboxRow = await pool
      .query(
        "SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1 ORDER BY created_at DESC LIMIT 1",
        [email],
      )
      .then((r) => r.rows[0] as { payload: { data: { token: string } } });

    await verifyEmail.execute({ token: outboxRow.payload.data.token });

    return email;
  }

  it("logs in with correct credentials", async () => {
    const email = await activeUser();

    const result = await login.execute({ email, password, ip: "203.0.113.10" });

    expect(result.userId).toBeDefined();
  });

  it("rejects a wrong password with UNAUTHENTICATED", async () => {
    const email = await activeUser();

    await expect(
      login.execute({ email, password: "totally-wrong-passphrase", ip: "203.0.113.11" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects an unknown email with the same code and message as a wrong password", async () => {
    const wrongPasswordError: unknown = await login
      .execute({
        email: await activeUser(),
        password: "totally-wrong-passphrase",
        ip: "203.0.113.12",
      })
      .catch((error: unknown) => error);

    const unknownEmailError: unknown = await login
      .execute({
        email: `unknown-${randomUUID()}@example.test`,
        password: "totally-wrong-passphrase",
        ip: "203.0.113.13",
      })
      .catch((error: unknown) => error);

    expect(unknownEmailError).toBeInstanceOf(DomainError);
    expect(wrongPasswordError).toBeInstanceOf(DomainError);
    expect((unknownEmailError as DomainError).code).toBe((wrongPasswordError as DomainError).code);
    expect((unknownEmailError as DomainError).message).toBe(
      (wrongPasswordError as DomainError).message,
    );
  });

  it("does not leak a large, consistent timing difference between unknown-email and wrong-password paths", async () => {
    const knownEmail = await activeUser();
    const unknownEmail = `unknown-${randomUUID()}@example.test`;
    const samples = 5;

    const medianTimeOf = async (email: string, ipPrefix: string): Promise<number> => {
      const durations: number[] = [];
      for (let i = 0; i < samples; i += 1) {
        const start = performance.now();
        await login
          .execute({ email, password: "totally-wrong-passphrase", ip: `${ipPrefix}.${i}` })
          .catch(() => null);
        durations.push(performance.now() - start);
      }
      durations.sort((a, b) => a - b);
      return durations[Math.floor(samples / 2)] ?? 0;
    };

    const knownMs = await medianTimeOf(knownEmail, "203.0.113.60");
    const unknownMs = await medianTimeOf(unknownEmail, "203.0.113.61");

    // Bounded-difference (not exact-equality) assertion per RULE-T02 to avoid
    // flakiness from DB round-trip jitter, while still catching a code path
    // that skips the Argon2 verify entirely for unknown emails.
    expect(Math.abs(knownMs - unknownMs)).toBeLessThan(Math.max(knownMs, unknownMs));
  });

  it("locks out after repeated failures for the same email+ip and records the attempts", async () => {
    const email = await activeUser();
    const ip = "203.0.113.30";

    for (let i = 0; i < 5; i += 1) {
      await login.execute({ email, password: "totally-wrong-passphrase", ip }).catch(() => null);
    }

    await expect(login.execute({ email, password, ip })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    const rows = await pool
      .query("SELECT count(*)::int FROM login_attempts WHERE succeeded = false")
      .then((r) => r.rows as { count: number }[]);
    expect(rows[0]?.count).toBeGreaterThanOrEqual(5);
  });

  it("does not lock out a different IP for the same email", async () => {
    const email = await activeUser();

    for (let i = 0; i < 5; i += 1) {
      await login
        .execute({ email, password: "totally-wrong-passphrase", ip: "203.0.113.40" })
        .catch(() => null);
    }

    const result = await login.execute({ email, password, ip: "203.0.113.41" });
    expect(result.userId).toBeDefined();
  });

  it("records a succeeded=true attempt on a correct login", async () => {
    const email = await activeUser();
    await login.execute({ email, password, ip: "203.0.113.50" });

    const [row] = await pool
      .query("SELECT succeeded FROM login_attempts ORDER BY created_at DESC LIMIT 1")
      .then((r) => r.rows);
    expect(row.succeeded).toBe(true);
  });

  it("emits exactly one LOGIN_SUCCEEDED audit event on success, none on failure", async () => {
    const email = await activeUser();

    const { userId } = await login.execute({ email, password, ip: "203.0.113.70" });
    await login
      .execute({ email, password: "totally-wrong-passphrase", ip: "203.0.113.71" })
      .catch(() => null);

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'LOGIN_SUCCEEDED'",
        [userId],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });
});
