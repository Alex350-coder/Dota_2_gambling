export interface Wallet {
  readonly userId: string;
  readonly currency: string;
  readonly availableMinor: bigint;
  readonly lockedMinor: bigint;
  readonly version: bigint;
  readonly updatedAt: Date;
}

/**
 * Scoped to a single owner at construction time — every implementation must filter
 * `WHERE user_id = $ownerId` at the SQL level, never only in application code.
 */
export interface WalletRepository {
  findByCurrency(currency: string): Promise<Wallet | null>;
}
