import { describe, expect, it } from "vitest";
import { can } from "./policy";

describe("can", () => {
  it("allows a USER to manage their own session", () => {
    expect(can({ roles: ["USER"] }, "session:revoke", { ownerId: "u1" }, "u1")).toBe(true);
  });

  it("denies a USER managing another user's session", () => {
    expect(can({ roles: ["USER"] }, "session:revoke", { ownerId: "u2" }, "u1")).toBe(false);
  });

  it("denies a USER from admin-only actions", () => {
    expect(can({ roles: ["USER"] }, "user:suspend", { ownerId: "u1" }, "u1")).toBe(false);
  });

  it("allows an ADMIN to suspend any user", () => {
    expect(can({ roles: ["ADMIN"] }, "user:suspend", { ownerId: "u2" }, "admin1")).toBe(true);
  });

  it("allows an AUDITOR read-only access", () => {
    expect(can({ roles: ["AUDITOR"] }, "audit:read", { ownerId: "u2" }, "auditor1")).toBe(true);
  });

  it("denies an AUDITOR write access", () => {
    expect(can({ roles: ["AUDITOR"] }, "user:suspend", { ownerId: "u2" }, "auditor1")).toBe(false);
  });

  it("denies an actor with no matching role", () => {
    expect(can({ roles: [] }, "session:revoke", { ownerId: "u1" }, "u1")).toBe(false);
  });

  it("allows a user with multiple roles if any role grants the action", () => {
    expect(can({ roles: ["USER", "ADMIN"] }, "user:suspend", { ownerId: "u2" }, "admin1")).toBe(
      true,
    );
  });
});
