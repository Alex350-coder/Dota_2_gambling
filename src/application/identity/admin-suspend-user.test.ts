import { describe, expect, test } from "vitest";
import { DomainError } from "@/domain/errors";
import type { AuditWriter, UserRecord, UserRepository } from "@/domain/ports";
import { AdminSuspendUserUseCase } from "./admin-suspend-user";

function userFixture(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    email: "u@example.test",
    passwordHash: "hash",
    status: "ACTIVE",
    dateOfBirth: "1990-01-01",
    emailVerifiedAt: new Date("2025-01-01T00:00:00Z"),
    revocableAt: null,
    mfaSecretEnc: null,
    mfaEnabledAt: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("AdminSuspendUserUseCase", () => {
  test("suspends an ACTIVE user and records exactly one audit event", async () => {
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

    const useCase = new AdminSuspendUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      clock: { now: () => new Date("2026-01-01T00:00:00Z") },
      audit,
    });

    const result = await useCase.execute({ actorId: "admin-1", userId: user.id });

    expect(result.status).toBe("SUSPENDED");
    expect(updatedStatus).toBe("SUSPENDED");
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({ action: "USER_SUSPENDED", entityId: user.id });
  });

  test("rejects suspending an already-SUSPENDED user with INVALID_STATE_TRANSITION", async () => {
    const user = userFixture({ status: "SUSPENDED" });
    const users: Partial<UserRepository> = { findById: () => Promise.resolve(user) };

    const useCase = new AdminSuspendUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      clock: { now: () => new Date() },
      audit: { record: () => Promise.resolve() },
    });

    await expect(useCase.execute({ actorId: "admin-1", userId: user.id })).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });

  test("reports RESOURCE_NOT_FOUND for an unknown user", async () => {
    const users: Partial<UserRepository> = { findById: () => Promise.resolve(null) };

    const useCase = new AdminSuspendUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      clock: { now: () => new Date() },
      audit: { record: () => Promise.resolve() },
    });

    await expect(useCase.execute({ actorId: "admin-1", userId: "missing" })).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});
