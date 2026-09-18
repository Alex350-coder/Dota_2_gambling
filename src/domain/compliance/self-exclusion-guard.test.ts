import { describe, expect, it } from "vitest";
import { assertAdminCanChangeStatus } from "./self-exclusion-guard";

describe("assertAdminCanChangeStatus", () => {
  const now = new Date("2026-01-15T00:00:00.000Z");

  it("allows changing a non-excluded account's status", () => {
    expect(() => {
      assertAdminCanChangeStatus({ status: "ACTIVE", revocableAt: null }, now);
    }).not.toThrow();
  });

  it("rejects any status change while permanently self-excluded (revocableAt = null)", () => {
    expect(() => {
      assertAdminCanChangeStatus({ status: "SELF_EXCLUDED", revocableAt: null }, now);
    }).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_OPERATION" }));
  });

  it("rejects a status change before revocableAt", () => {
    const revocableAt = new Date(now.getTime() + 60_000);
    expect(() => {
      assertAdminCanChangeStatus({ status: "SELF_EXCLUDED", revocableAt }, now);
    }).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_OPERATION" }));
  });

  it("allows a status change once revocableAt has passed", () => {
    const revocableAt = new Date(now.getTime() - 1_000);
    expect(() => {
      assertAdminCanChangeStatus({ status: "SELF_EXCLUDED", revocableAt }, now);
    }).not.toThrow();
  });
});
