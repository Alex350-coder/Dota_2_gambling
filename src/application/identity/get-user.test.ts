import { describe, expect, test } from "vitest";
import { DomainError } from "@/domain/errors";
import type { AuditWriter, UserRecord, UserRepository } from "@/domain/ports";
import { GetUserUseCase } from "./get-user";

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

describe("GetUserUseCase", () => {
  test("returns the user and audits exactly one ADMIN_USER_READ event", async () => {
    const user = userFixture();
    const auditEvents: unknown[] = [];
    const users: Partial<UserRepository> = { findById: () => Promise.resolve(user) };
    const audit: AuditWriter<undefined> = {
      record: (_tx, event) => {
        auditEvents.push(event);
        return Promise.resolve();
      },
    };

    const useCase = new GetUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      audit,
    });

    const result = await useCase.execute({ actorId: "admin-1", userId: user.id });

    expect(result.id).toBe(user.id);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: "ADMIN_USER_READ",
      actorType: "admin",
      actorId: "admin-1",
      entityId: user.id,
    });
  });

  test("reports RESOURCE_NOT_FOUND for an unknown user without recording an audit event", async () => {
    const auditEvents: unknown[] = [];
    const users: Partial<UserRepository> = { findById: () => Promise.resolve(null) };
    const audit: AuditWriter<undefined> = {
      record: (_tx, event) => {
        auditEvents.push(event);
        return Promise.resolve();
      },
    };

    const useCase = new GetUserUseCase({
      uow: { run: (fn) => fn(undefined) },
      users: () => users as UserRepository,
      audit,
    });

    await expect(useCase.execute({ actorId: "admin-1", userId: "missing" })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(auditEvents).toHaveLength(0);
  });
});
