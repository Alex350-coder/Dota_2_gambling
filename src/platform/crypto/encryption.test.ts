import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./encryption";

const SECRET = "a-locally-generated-encryption-secret";

describe("encrypt/decrypt", () => {
  it("round-trips plaintext through encrypt then decrypt", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";

    const ciphertext = encrypt(plaintext, SECRET);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext, SECRET)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const plaintext = "same-plaintext";

    expect(encrypt(plaintext, SECRET)).not.toBe(encrypt(plaintext, SECRET));
  });

  it("fails to decrypt with the wrong secret", () => {
    const ciphertext = encrypt("secret-value", SECRET);

    expect(() => decrypt(ciphertext, "a-different-secret")).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decrypt("not-a-valid-payload", SECRET)).toThrow();
  });
});
