import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import type { UserStatus } from "@/domain/ports";
import { assertActiveAccount, assertUserStatusTransition } from "./status";

const ALL_STATUSES: readonly UserStatus[] = [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
  "SELF_EXCLUDED",
];

describe("assertActiveAccount", () => {
  it("allows an ACTIVE account", () => {
    expect(() => {
      assertActiveAccount("ACTIVE");
    }).not.toThrow();
  });

  it("rejects SUSPENDED with ACCOUNT_SUSPENDED", () => {
    try {
      assertActiveAccount("SUSPENDED");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("ACCOUNT_SUSPENDED");
    }
  });

  it("rejects SELF_EXCLUDED with ACCOUNT_SELF_EXCLUDED", () => {
    try {
      assertActiveAccount("SELF_EXCLUDED");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("ACCOUNT_SELF_EXCLUDED");
    }
  });

  it("rejects CLOSED with ACCOUNT_SUSPENDED", () => {
    try {
      assertActiveAccount("CLOSED");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("ACCOUNT_SUSPENDED");
    }
  });

  it("rejects PENDING_VERIFICATION with UNAUTHORIZED_OPERATION code", () => {
    try {
      assertActiveAccount("PENDING_VERIFICATION");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("UNAUTHORIZED_OPERATION");
    }
  });
});

describe("assertUserStatusTransition (T-903)", () => {
  const SUSPENDABLE: readonly UserStatus[] = ["ACTIVE", "PENDING_VERIFICATION", "SELF_EXCLUDED"];

  it.each(SUSPENDABLE)("allows suspending a %s account", (status) => {
    expect(() => {
      assertUserStatusTransition(status, "SUSPENDED");
    }).not.toThrow();
  });

  it.each(["SUSPENDED", "CLOSED"] as const)(
    "rejects suspending an already-%s account with INVALID_STATE_TRANSITION",
    (status) => {
      try {
        assertUserStatusTransition(status, "SUSPENDED");
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe("INVALID_STATE_TRANSITION");
      }
    },
  );

  it("allows restoring a SUSPENDED account to ACTIVE", () => {
    expect(() => {
      assertUserStatusTransition("SUSPENDED", "ACTIVE");
    }).not.toThrow();
  });

  it.each(ALL_STATUSES.filter((status) => status !== "SUSPENDED"))(
    "rejects restoring a %s account with INVALID_STATE_TRANSITION",
    (status) => {
      try {
        assertUserStatusTransition(status, "ACTIVE");
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe("INVALID_STATE_TRANSITION");
      }
    },
  );
});
