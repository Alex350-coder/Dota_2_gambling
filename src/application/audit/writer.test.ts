import { describe, expect, it } from "vitest";
import {
  betCancelledEvent,
  betPlacedEvent,
  emailVerifiedEvent,
  loginSucceededEvent,
  mfaDisabledEvent,
  mfaEnrolledEvent,
  mfaRecoveryCodeRedeemedEvent,
  mfaVerifiedEvent,
  passwordResetEvent,
  sessionRevokedEvent,
  userRegisteredEvent,
} from "./writer";

describe("audit event builders", () => {
  it("builds a USER_REGISTERED event scoped to the new user", () => {
    expect(userRegisteredEvent("user-1")).toEqual({
      actorType: "user",
      actorId: "user-1",
      action: "USER_REGISTERED",
      entityType: "user",
      entityId: "user-1",
    });
  });

  it("builds an EMAIL_VERIFIED event", () => {
    expect(emailVerifiedEvent("user-1")).toMatchObject({
      action: "EMAIL_VERIFIED",
      entityType: "user",
      entityId: "user-1",
    });
  });

  it("builds a LOGIN_SUCCEEDED event", () => {
    expect(loginSucceededEvent("user-1")).toMatchObject({
      action: "LOGIN_SUCCEEDED",
      entityType: "user",
      entityId: "user-1",
    });
  });

  it("builds a SESSION_REVOKED event scoped to the session entity", () => {
    expect(sessionRevokedEvent("user-1", "session-1")).toEqual({
      actorType: "user",
      actorId: "user-1",
      action: "SESSION_REVOKED",
      entityType: "session",
      entityId: "session-1",
    });
  });

  it("builds a PASSWORD_RESET event", () => {
    expect(passwordResetEvent("user-1")).toMatchObject({
      action: "PASSWORD_RESET",
      entityType: "user",
      entityId: "user-1",
    });
  });

  it("builds MFA lifecycle events", () => {
    expect(mfaEnrolledEvent("user-1")).toMatchObject({ action: "MFA_ENROLLED" });
    expect(mfaVerifiedEvent("user-1")).toMatchObject({ action: "MFA_VERIFIED" });
    expect(mfaDisabledEvent("user-1")).toMatchObject({ action: "MFA_DISABLED" });
    expect(mfaRecoveryCodeRedeemedEvent("user-1")).toMatchObject({
      action: "MFA_RECOVERY_CODE_REDEEMED",
    });
  });

  it("builds a BET_PLACED event scoped to the order entity, carrying the ledger transaction id", () => {
    expect(betPlacedEvent("user-1", "order-1", "ledger-tx-1")).toEqual({
      actorType: "user",
      actorId: "user-1",
      action: "BET_PLACED",
      entityType: "bet_order",
      entityId: "order-1",
      after: { ledgerTransactionId: "ledger-tx-1" },
    });
  });

  it("builds a user-actor BET_CANCELLED event carrying the refund ledger transaction id", () => {
    expect(betCancelledEvent("user-1", "order-1", "ledger-tx-2")).toEqual({
      actorType: "user",
      actorId: "user-1",
      action: "BET_CANCELLED",
      entityType: "bet_order",
      entityId: "order-1",
      after: { ledgerTransactionId: "ledger-tx-2" },
    });
  });

  it("builds a system-actor BET_CANCELLED event for market-close release", () => {
    expect(betCancelledEvent(null, "order-1")).toEqual({
      actorType: "system",
      actorId: null,
      action: "BET_CANCELLED",
      entityType: "bet_order",
      entityId: "order-1",
      after: null,
    });
  });
});
