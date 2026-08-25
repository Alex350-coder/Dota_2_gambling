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

  /**
   * Locks the wallet row `FOR UPDATE` so a balance precondition check (e.g. `INSUFFICIENT_FUNDS`)
   * is atomic with the caller's subsequent ledger posting — without this, a raw negative-balance
   * write would only be caught by the DB's `chk_wallets_available_nonneg` CHECK constraint,
   * surfacing as an unmapped SQL error instead of a clean DomainError.
   */
  findByCurrencyForUpdate(currency: string): Promise<Wallet | null>;
}
