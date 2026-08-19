import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleMfaRecoveryCodeRepository } from "@/infra/db/repositories/mfa-recovery-code-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { Argon2PasswordHasher } from "@/infra/crypto/password";
import { TotpMfaProvider } from "@/infra/crypto/totp";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import {
  DisableMfaUseCase,
  EnrollMfaUseCase,
  RedeemMfaRecoveryCodeUseCase,
  VerifyMfaUseCase,
} from "@/application/identity/mfa";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("MFA enrol/verify/disable/recovery", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const mfa = new TotpMfaProvider("Dota Gambling Test");
  const passwordHasher = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
  const encryptionKey = "test-encryption-key-not-for-production-use";

  const deps = {
    uow,
    users: (tx: DbTx) => new DrizzleUserRepository(tx),
    recoveryCodes: (tx: DbTx) => new DrizzleMfaRecoveryCodeRepository(tx),
    mfa,
    passwordHasher,
    ids,
    clock,
    encryptionKey,
    audit: new DrizzleAuditWriter(),
  };

  const enroll = new EnrollMfaUseCase<DbTx>(deps);
  const verify = new VerifyMfaUseCase<DbTx>(deps);
  const disable = new DisableMfaUseCase<DbTx>(deps);
  const redeemRecoveryCode = new RedeemMfaRecoveryCodeUseCase<DbTx>(deps);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(): Promise<{ userId: string; password: string }> {
    const userId = ids.next();
    const password = "a-strong-passphrase-42";
    const passwordHash = await passwordHasher.hash(password);
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth, password_hash) VALUES ($1, $2, 'ACTIVE', '1990-01-01', $3)",
      [userId, `mfa-${randomUUID()}@example.test`, passwordHash],
    );
    return { userId, password };
  }

  function extractSecret(otpAuthUri: string): string {
    const secret = new URL(otpAuthUri).searchParams.get("secret");
    if (!secret) {
      throw new Error("otpAuthUri missing secret query param");
    }
    return secret;
  }

  it("does not activate MFA until the enrolled secret is verified", async () => {
    const { userId } = await createUser();

    await enroll.execute({ userId, accountLabel: "user@example.test" });

    const row = await pool
      .query("SELECT mfa_secret_enc, mfa_enabled_at FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { mfa_secret_enc: string; mfa_enabled_at: string | null });
    expect(row.mfa_secret_enc).not.toBeNull();
    expect(row.mfa_enabled_at).toBeNull();
  });

  it("activates MFA on the first successful verify", async () => {
    const { userId } = await createUser();
    const { otpAuthUri } = await enroll.execute({ userId, accountLabel: "user@example.test" });
    const secret = extractSecret(otpAuthUri);
    const code = await generate({ secret });

    await verify.execute({ userId, code });

    const row = await pool
      .query("SELECT mfa_enabled_at FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { mfa_enabled_at: string | null });
    expect(row.mfa_enabled_at).not.toBeNull();
  });

  it("rejects a wrong TOTP code with MFA_INVALID_CODE", async () => {
    const { userId } = await createUser();
    await enroll.execute({ userId, accountLabel: "user@example.test" });

    await expect(verify.execute({ userId, code: "000000" })).rejects.toMatchObject({
      code: "MFA_INVALID_CODE",
    });
  });

  it("rejects verification for a user with no enrollment in progress", async () => {
    const { userId } = await createUser();

    await expect(verify.execute({ userId, code: "123456" })).rejects.toBeInstanceOf(DomainError);
  });

  it("disable requires the correct password and clears the secret", async () => {
    const { userId, password } = await createUser();
    const { otpAuthUri } = await enroll.execute({ userId, accountLabel: "user@example.test" });
    const secret = extractSecret(otpAuthUri);
    await verify.execute({ userId, code: await generate({ secret }) });

    await expect(disable.execute({ userId, password: "wrong-password" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    await disable.execute({ userId, password });

    const row = await pool
      .query("SELECT mfa_secret_enc, mfa_enabled_at FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { mfa_secret_enc: string | null; mfa_enabled_at: string | null });
    expect(row.mfa_secret_enc).toBeNull();
    expect(row.mfa_enabled_at).toBeNull();
  });

  it("redeems a recovery code exactly once", async () => {
    const { userId } = await createUser();
    const { recoveryCodes } = await enroll.execute({ userId, accountLabel: "user@example.test" });
    const [code] = recoveryCodes;
    if (!code) {
      throw new Error("expected at least one recovery code");
    }

    await redeemRecoveryCode.execute({ userId, code });

    await expect(redeemRecoveryCode.execute({ userId, code })).rejects.toMatchObject({
      code: "MFA_INVALID_CODE",
    });
  });

  it("rejects an unknown recovery code", async () => {
    const { userId } = await createUser();
    await enroll.execute({ userId, accountLabel: "user@example.test" });

    await expect(
      redeemRecoveryCode.execute({ userId, code: "not-a-real-code" }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_CODE" });
  });

  it("disable revokes all outstanding recovery codes", async () => {
    const { userId, password } = await createUser();
    const { recoveryCodes } = await enroll.execute({ userId, accountLabel: "user@example.test" });
    const [code] = recoveryCodes;
    if (!code) {
      throw new Error("expected at least one recovery code");
    }

    await disable.execute({ userId, password });

    await expect(redeemRecoveryCode.execute({ userId, code })).rejects.toMatchObject({
      code: "MFA_INVALID_CODE",
    });
  });

  it("emits exactly one audit event per MFA lifecycle action", async () => {
    const { userId, password } = await createUser();

    async function countAuditEvents(action: string): Promise<number> {
      const rows = await pool
        .query("SELECT 1 FROM audit_events WHERE entity_id = $1 AND action = $2", [userId, action])
        .then((r) => r.rows);
      return rows.length;
    }

    const { otpAuthUri, recoveryCodes } = await enroll.execute({
      userId,
      accountLabel: "user@example.test",
    });
    expect(await countAuditEvents("MFA_ENROLLED")).toBe(1);

    const secret = extractSecret(otpAuthUri);
    await verify.execute({ userId, code: await generate({ secret }) });
    expect(await countAuditEvents("MFA_VERIFIED")).toBe(1);

    const [code] = recoveryCodes;
    if (!code) {
      throw new Error("expected at least one recovery code");
    }
    await redeemRecoveryCode.execute({ userId, code });
    expect(await countAuditEvents("MFA_RECOVERY_CODE_REDEEMED")).toBe(1);

    await disable.execute({ userId, password });
    expect(await countAuditEvents("MFA_DISABLED")).toBe(1);
  });
});
