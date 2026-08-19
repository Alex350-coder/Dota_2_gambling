import { describe, expect, it } from "vitest";
import { isBreachedPassword } from "./breached-password";

describe("isBreachedPassword", () => {
  it("flags a password on the bundled list", () => {
    expect(isBreachedPassword("password123")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isBreachedPassword("PaSSword123")).toBe(true);
  });

  it("does not flag a password not on the list", () => {
    expect(isBreachedPassword("a-genuinely-unpredictable-passphrase-9427")).toBe(false);
  });
});
