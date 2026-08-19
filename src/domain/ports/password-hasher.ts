/**
 * Argon2id parameters live in the PHC-formatted hash string itself, so a stored
 * hash is self-describing and `needsRehash` can detect params weaker than the
 * currently configured ones without a separate params column.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  needsRehash(hash: string): boolean;
}
