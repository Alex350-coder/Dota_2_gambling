import type { Wallet } from "@/domain/ports";

/** Bigint minor-unit fields are always serialized via `.toString()` in JSON responses. */
export function serializeWallet(wallet: Wallet) {
  return {
    currency: wallet.currency,
    availableMinor: wallet.availableMinor.toString(),
    lockedMinor: wallet.lockedMinor.toString(),
    updatedAt: wallet.updatedAt,
  };
}
