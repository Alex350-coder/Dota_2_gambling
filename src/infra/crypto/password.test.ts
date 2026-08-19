import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "./password";

const REFERENCE_PARAMS = { memoryCost: 262144, timeCost: 3, parallelism: 1 };
const WEAK_PARAMS = { memoryCost: 8, timeCost: 1, parallelism: 1 };

describe("Argon2PasswordHasher", () => {
  it("verifies a password against its own hash", async () => {
    const hasher = new Argon2PasswordHasher(REFERENCE_PARAMS);

    const hash = await hasher.hash("correct-horse-battery-staple");

    await expect(hasher.verify(hash, "correct-horse-battery-staple")).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hasher = new Argon2PasswordHasher(REFERENCE_PARAMS);

    const hash = await hasher.hash("correct-horse-battery-staple");

    await expect(hasher.verify(hash, "wrong-password")).resolves.toBe(false);
  });

  it("hashes at the configured cost, taking at least 250ms on the reference host (Security.md §4)", async () => {
    const hasher = new Argon2PasswordHasher(REFERENCE_PARAMS);

    const start = performance.now();
    await hasher.hash("correct-horse-battery-staple");
    const elapsedMs = performance.now() - start;

    // eslint-disable-next-line project/no-console -- test evidence for the AC, not app logging
    console.info(`[T-301] argon2id hash timing: ${elapsedMs.toFixed(1)}ms`);
    expect(elapsedMs).toBeGreaterThanOrEqual(250);
  });

  it("flags a hash produced with weaker-than-configured params as needing rehash", async () => {
    const weakHasher = new Argon2PasswordHasher(WEAK_PARAMS);
    const currentHasher = new Argon2PasswordHasher(REFERENCE_PARAMS);

    const weakHash = await weakHasher.hash("correct-horse-battery-staple");

    expect(currentHasher.needsRehash(weakHash)).toBe(true);
  });

  it("does not flag a hash already produced with the current params", async () => {
    const hasher = new Argon2PasswordHasher(REFERENCE_PARAMS);

    const hash = await hasher.hash("correct-horse-battery-staple");

    expect(hasher.needsRehash(hash)).toBe(false);
  });
});
