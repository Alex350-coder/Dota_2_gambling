import type { BetOrderRepository, UnitOfWork, Wallet, WalletRepository } from "@/domain/ports";

export interface GetWalletInput {
  readonly userId: string;
  readonly currency: string;
}

export interface WalletMarketBreakdown {
  readonly marketId: string;
  readonly lockedMinor: bigint;
}

export interface GetWalletResult {
  readonly wallet: Wallet;
  readonly lockedByMarket: readonly WalletMarketBreakdown[];
}

export interface GetWalletDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly wallets: (tx: Tx, ownerId: string) => WalletRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
}

const OPEN_STATUSES = new Set(["PENDING", "OPEN", "MATCHED"]);

/**
 * Reads a user's own available/locked wallet balance plus a per-market breakdown of the
 * `locked` figure — derived from live order state (matched + unmatched stake per open order),
 * never a cached total, so it can never drift from `wallets.locked_minor` (reconciled by
 * INV-02, `src/infra/db/reconcile-queries.ts`). A user with no wallet row yet (never funded)
 * reads as an all-zero wallet rather than a 404 — matching the "provision on first money-in"
 * rule wallet-repository.ts documents for writes.
 */
export class GetWalletUseCase<Tx> {
  constructor(private readonly deps: GetWalletDeps<Tx>) {}

  async execute(input: GetWalletInput): Promise<GetWalletResult> {
    return this.deps.uow.run(async (tx) => {
      const wallet = await this.deps.wallets(tx, input.userId).findByCurrency(input.currency);
      const resolvedWallet: Wallet = wallet ?? {
        userId: input.userId,
        currency: input.currency,
        availableMinor: 0n,
        lockedMinor: 0n,
        version: 0n,
        updatedAt: new Date(0),
      };

      const orders = await this.deps.betOrders(tx, input.userId).listByOwner({});
      const lockedByMarketMap = new Map<string, bigint>();
      for (const order of orders) {
        if (!OPEN_STATUSES.has(order.status)) {
          continue;
        }
        const locked = order.matchedMinor + order.unmatchedMinor;
        if (locked <= 0n) {
          continue;
        }
        lockedByMarketMap.set(
          order.marketId,
          (lockedByMarketMap.get(order.marketId) ?? 0n) + locked,
        );
      }

      const lockedByMarket = [...lockedByMarketMap.entries()].map(([marketId, lockedMinor]) => ({
        marketId,
        lockedMinor,
      }));

      return { wallet: resolvedWallet, lockedByMarket };
    });
  }
}
