import { describe, expect, test } from "vitest";
import type { AuditWriter, UserRecord, UserRepository } from "@/domain/ports";
import { AdminRestoreUserUseCase } from "./admin-restore-user";

function userFixture(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    email: "u@example.test",
    passwordHash: "hash",
    status: "SUSPENDED",
    dateOfBirth: "1990-01-01",
    emailVerifiedAt: new Date("2025-01-01T00:00:00Z"),
    revocableAt: null,
    mfaSecretEnc: null,
    mfaEnabledAt: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("AdminRestoreUserUseCase", () => {
  test("restores a SUSPENDED user to ACTIVE and records exactly one audit event", async () => {
    const user = userFixture();
    let updatedStatus: UserRecord["status"] | undefined;
    const auditEvents: unknown[] = [];

    const users: Partial<UserRepository> = {
      findById: () => Promise.resolve(user),
      updateStatus: (_id, status) => {
        updatedStatus = status;
        return Promise.resolve();
      },
    };
    const audit: AuditWriter<undefined> = {
      record: (_tx, event) => {
        auditEvents.push(event);
        return Promise.resolve();
      },
    };

    const useCase = new AdminRestoreUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      clock: { now: () => new Date("2026-01-01T00:00:00Z") },
      audit,
    });

    const result = await useCase.execute({ actorId: "admin-1", userId: user.id });

    expect(result.status).toBe("ACTIVE");
    expect(updatedStatus).toBe("ACTIVE");
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({ action: "USER_RESTORED", entityId: user.id });
  });

  test("rejects restoring a SELF_EXCLUDED user with INVALID_STATE_TRANSITION", async () => {
    const user = userFixture({ status: "SELF_EXCLUDED" });
    const users: Partial<UserRepository> = { findById: () => Promise.resolve(user) };

    const useCase = new AdminRestoreUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      clock: { now: () => new Date() },
      audit: { record: () => Promise.resolve() },
    });

    await expect(useCase.execute({ actorId: "admin-1", userId: user.id })).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });

  test("rejects restoring an ACTIVE user with INVALID_STATE_TRANSITION", async () => {
    const user = userFixture({ status: "ACTIVE" });
    const users: Partial<UserRepository> = { findById: () => Promise.resolve(user) };

    const useCase = new AdminRestoreUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      clock: { now: () => new Date() },
      audit: { record: () => Promise.resolve() },
    });

    await expect(useCase.execute({ actorId: "admin-1", userId: user.id })).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });
});
