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

  it("allows a USER to read their own profile", () => {
    expect(can({ roles: ["USER"] }, "user:read", { ownerId: "u1" }, "u1")).toBe(true);
  });

  it("denies a USER reading another user's profile", () => {
    expect(can({ roles: ["USER"] }, "user:read", { ownerId: "u2" }, "u1")).toBe(false);
  });

  it("allows an ADMIN to read any user's profile", () => {
    expect(can({ roles: ["ADMIN"] }, "user:read", { ownerId: "u2" }, "admin1")).toBe(true);
  });

  it("allows a USER to manage their own MFA settings", () => {
    expect(can({ roles: ["USER"] }, "mfa:manage", { ownerId: "u1" }, "u1")).toBe(true);
  });

  it("denies a USER managing another user's MFA settings", () => {
    expect(can({ roles: ["USER"] }, "mfa:manage", { ownerId: "u2" }, "u1")).toBe(false);
  });

  it("denies even an ADMIN from managing another user's MFA settings", () => {
    expect(can({ roles: ["ADMIN"] }, "mfa:manage", { ownerId: "u2" }, "admin1")).toBe(false);
  });

  it("allows a USER to place their own bet", () => {
    expect(can({ roles: ["USER"] }, "bet:place", { ownerId: "u1" }, "u1")).toBe(true);
  });

  it("denies a USER placing a bet as another user", () => {
    expect(can({ roles: ["USER"] }, "bet:place", { ownerId: "u2" }, "u1")).toBe(false);
  });

  it("allows an ADMIN to read/manage any user's bet for support/audit", () => {
    expect(can({ roles: ["ADMIN"] }, "bet:manage", { ownerId: "u2" }, "admin1")).toBe(true);
  });

  it("allows a USER to manage (cancel) their own bet", () => {
    expect(can({ roles: ["USER"] }, "bet:manage", { ownerId: "u1" }, "u1")).toBe(true);
  });
});
