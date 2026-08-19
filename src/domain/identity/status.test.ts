import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { assertActiveAccount } from "./status";

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
