import { assertTransition, createBetOrder } from "@/domain/betting";
import { add, negate, ZERO_MINOR } from "@/domain/money";
import type {
  BetOrderRepository,
  BookRepository,
  Clock,
  EconomicProfileRepository,
  IdGenerator,
  LedgerWriter,
  Market,
} from "@/domain/ports";

export interface ReleaseUnmatchedDeps<Tx> {
  readonly book: (tx: Tx) => BookRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * Batch-releases every still-`OPEN` order's unmatched remainder back to available on market
 * close (T-511, FIN-05). Run inside the same transaction as the `CLOSED` transition so a
 * closed market never leaves stakes stranded in `locked`. Idempotent per order: a retry only
 * ever sees orders still `status = 'OPEN'` (this function's own write moves them to
 * `CANCELLED`), and `ledger.post`'s idempotency key makes a duplicate call for the same order
 * a no-op even if the order-status write hadn't yet committed.
 */
export async function releaseUnmatchedOnClose<Tx>(
  tx: Tx,
  deps: ReleaseUnmatchedDeps<Tx>,
  market: Market,
): Promise<void> {
  const economicProfile = await deps.economicProfiles(tx).findById(market.economicProfileId);
  if (!economicProfile) {
    return;
  }

  const openOrders = await deps.book(tx).findOpenOrdersByMarket(market.id);
  const now = deps.clock.now();

  for (const order of openOrders) {
    const releasedMinor = order.unmatchedMinor;
    const updated = createBetOrder({
      ...order,
      unmatchedMinor: ZERO_MINOR,
      releasedMinor: add(order.releasedMinor, releasedMinor),
      status: "CANCELLED",
      updatedAt: now,
    });

    assertTransition(order.status, updated.status, { actor: "SYSTEM", marketStatus: "CLOSED" });

    await deps.ledger.post(tx, {
      id: deps.ids.next(),
      kind: "RELEASE",
      referenceType: "bet_order",
      referenceId: order.id,
      idempotencyKey: `release:${order.id}`,
      actorType: "SYSTEM",
      actorId: undefined,
      entries: [
        {
          accountKey: `USER_LOCKED:${order.userId}`,
          currency: economicProfile.currency,
          signedAmountMinor: negate(releasedMinor),
        },
        {
          accountKey: `USER_AVAILABLE:${order.userId}`,
          currency: economicProfile.currency,
          signedAmountMinor: releasedMinor,
        },
      ],
    });

    await deps.betOrders(tx, order.userId).save(updated);
  }
}
