import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * ENCRYPTION_KEY is an arbitrary-length secret (Security.md doesn't pin an
 * exact byte length beyond "generate your own locally"), so it's hashed down
 * to a fixed 32-byte AES-256 key rather than requiring callers to pre-derive one.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** Encrypts `plaintext` at rest (e.g. users.mfa_secret_enc). Format: iv.authTag.ciphertext, each base64. */
export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

export function decrypt(payload: string, secret: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("malformed encrypted payload");
  }

  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
