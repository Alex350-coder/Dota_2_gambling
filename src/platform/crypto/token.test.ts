import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashIdentifier, hashToken } from "./token";

describe("generateOpaqueToken", () => {
  it("generates a token with at least 256 bits of entropy (32 raw bytes)", () => {
    const token = generateOpaqueToken();

    expect(Buffer.from(token, "base64url").length).toBe(32);
  });

  it("generates a different token on every call", () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe("hashToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateOpaqueToken();

    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("produces a 64-character hex SHA-256 digest", () => {
    const digest = hashToken("sample-token");

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different digests for different tokens", () => {
    expect(hashToken(generateOpaqueToken())).not.toBe(hashToken(generateOpaqueToken()));
  });
});

describe("hashIdentifier", () => {
  it("produces a 64-character hex SHA-256 digest", () => {
    expect(hashIdentifier("user@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is case-insensitive and trims whitespace, like the citext email column", () => {
    expect(hashIdentifier("User@Example.com")).toBe(hashIdentifier(" user@example.com "));
  });

  it("produces different digests for different identifiers", () => {
    expect(hashIdentifier("user-a@example.com")).not.toBe(hashIdentifier("user-b@example.com"));
  });
});
