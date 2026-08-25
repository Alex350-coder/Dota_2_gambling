import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { assertNotPrivilegedActor, assertNotSelfMatch } from "./guards";

describe("assertNotSelfMatch", () => {
  it("throws SELF_MATCH_FORBIDDEN when the incoming and resting order share a user", () => {
    expect(() => {
      assertNotSelfMatch("u1", "u1");
    }).toThrow(DomainError);
    try {
      assertNotSelfMatch("u1", "u1");
    } catch (error) {
      expect((error as DomainError).code).toBe("SELF_MATCH_FORBIDDEN");
    }
  });

  it("does not throw when the incoming and resting order belong to different users", () => {
    expect(() => {
      assertNotSelfMatch("u1", "u2");
    }).not.toThrow();
  });
});

describe("assertNotPrivilegedActor", () => {
  it("throws UNAUTHORIZED_OPERATION when the bettor is the market's streamer", () => {
    expect(() => {
      assertNotPrivilegedActor("u1", "u1");
    }).toThrow(DomainError);
    try {
      assertNotPrivilegedActor("u1", "u1");
    } catch (error) {
      expect((error as DomainError).code).toBe("UNAUTHORIZED_OPERATION");
    }
  });

  it("does not throw when the bettor is not the market's streamer", () => {
    expect(() => {
      assertNotPrivilegedActor("u1", "u2");
    }).not.toThrow();
  });
});
