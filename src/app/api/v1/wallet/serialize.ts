import type { LedgerEntryRecord, Wallet } from "@/domain/ports";

/** Bigint minor-unit fields are always serialized via `.toString()` in JSON responses. */
export function serializeWallet(wallet: Wallet) {
  return {
    currency: wallet.currency,
    availableMinor: wallet.availableMinor.toString(),
    lockedMinor: wallet.lockedMinor.toString(),
    updatedAt: wallet.updatedAt,
  };
}

/** Bigint minor-unit fields are always serialized via `.toString()` in JSON responses. */
export function serializeLedgerEntry(entry: LedgerEntryRecord) {
  return {
    id: entry.id,
    transactionId: entry.transactionId,
    kind: entry.kind,
    currency: entry.currency,
    signedAmountMinor: entry.signedAmountMinor.toString(),
    createdAt: entry.createdAt,
  };
}
