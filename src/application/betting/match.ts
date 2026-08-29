import { planFifoAllocations, type RestingOrder } from "@/domain/matching";
import {
  assertTransition,
  createBetOrder,
  type BetOrder,
  type BetOrderStatus,
} from "@/domain/betting";
import { add, negate, sub, type Minor } from "@/domain/money";
import type {
  AllocationRepository,
  BetOrderRepository,
  BookRepository,
  Clock,
  IdGenerator,
  LedgerWriter,
} from "@/domain/ports";
import { assertNotPrivilegedActor, assertNotSelfMatch } from "./guards";

export interface MatchDeps<Tx> {
  readonly acquireMarketLock: (tx: Tx, marketId: string) => Promise<void>;
  readonly book: (tx: Tx) => BookRepository;
  readonly allocations: (tx: Tx) => AllocationRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface MatchIncomingOrderInput {
  readonly marketId: string;
  readonly currency: string;
  readonly streamerUserId: string;
  readonly incoming: BetOrder;
}

function nextStatus(unmatchedMinor: Minor): BetOrderStatus {
  return unmatchedMinor === 0n ? "MATCHED" : "OPEN";
}

/**
 * FIFO matching wired synchronously into placement (T-505..T-509). Lock ladder, fixed order,
 * never reversed: (1) advisory lock on the market, (2) the market row is already `FOR SHARE`
 * from the caller's placement read, (3) wallet locks happen inside `ledger.post` per allocation,
 * (4) the book scan below locks every resting row `FOR UPDATE`.
 */
export async function matchIncomingOrder<Tx>(
  tx: Tx,
  deps: MatchDeps<Tx>,
  input: MatchIncomingOrderInput,
): Promise<BetOrder> {
  const { incoming, marketId, currency, streamerUserId } = input;

  assertNotPrivilegedActor(incoming.userId, streamerUserId);

  await deps.acquireMarketLock(tx, marketId);

  const restingRows = await deps
    .book(tx)
    .findRestingOrders(marketId, incoming.outcomeId, incoming.userId);
  for (const resting of restingRows) {
    assertNotSelfMatch(incoming.userId, resting.userId);
  }

  const restingOrders: RestingOrder[] = restingRows.map((order) => ({
    orderId: order.id,
    unmatchedMinor: order.unmatchedMinor,
    oddsNum: order.oddsNum,
    oddsDen: order.oddsDen,
  }));

  const plan = planFifoAllocations({
    marketId,
    incomingOrderId: incoming.id,
    incomingUnmatchedMinor: incoming.unmatchedMinor,
    incomingOddsNum: incoming.oddsNum,
    incomingOddsDen: incoming.oddsDen,
    commissionBps: incoming.commissionBps,
    restingOrders,
  });

  const now = deps.clock.now();
  const restingByOrderId = new Map(restingRows.map((order) => [order.id, order]));
  const matchedAgainst = new Set(plan.allocations.map((allocation) => allocation.orderBId));

  for (const allocation of plan.allocations) {
    const restingOrder = restingByOrderId.get(allocation.orderBId);
    if (!restingOrder) {
      continue;
    }

    const sequence = await deps.allocations(tx).nextSequence(marketId);
    const allocationId = deps.ids.next();

    await deps.allocations(tx).create({
      id: allocationId,
      marketId,
      orderAId: allocation.orderAId,
      orderBId: allocation.orderBId,
      sequence,
      matchedMinor: allocation.amountMinor,
      createdAt: now,
      updatedAt: now,
    });

    await deps.ledger.post(tx, {
      id: deps.ids.next(),
      kind: "MATCH_ESCROW",
      referenceType: "match_allocation",
      referenceId: allocationId,
      idempotencyKey: `alloc:${allocationId}`,
      actorType: "SYSTEM",
      actorId: undefined,
      entries: [
        {
          accountKey: `USER_LOCKED:${incoming.userId}`,
          currency,
          signedAmountMinor: negate(allocation.amountMinor),
        },
        {
          accountKey: `USER_LOCKED:${restingOrder.userId}`,
          currency,
          signedAmountMinor: negate(allocation.amountMinor),
        },
        {
          accountKey: `MARKET_ESCROW:${marketId}`,
          currency,
          signedAmountMinor: add(allocation.amountMinor, allocation.amountMinor),
        },
      ],
    });
  }

  for (const remainder of plan.restingRemaining) {
    if (!matchedAgainst.has(remainder.orderId)) {
      continue;
    }
    const restingOrder = restingByOrderId.get(remainder.orderId);
    if (!restingOrder) {
      continue;
    }

    const matchedDelta = sub(restingOrder.unmatchedMinor, remainder.unmatchedMinor);
    const updated = createBetOrder({
      ...restingOrder,
      matchedMinor: add(restingOrder.matchedMinor, matchedDelta),
      unmatchedMinor: remainder.unmatchedMinor,
      status: nextStatus(remainder.unmatchedMinor),
      updatedAt: now,
    });

    assertTransition(restingOrder.status, updated.status, {
      actor: "SYSTEM",
      matchedMinor: updated.matchedMinor,
      unmatchedMinor: updated.unmatchedMinor,
    });

    await deps.betOrders(tx, restingOrder.userId).save(updated);
  }

  if (plan.allocations.length === 0) {
    return incoming;
  }

  const incomingMatchedDelta = sub(incoming.unmatchedMinor, plan.incomingRemainingMinor);
  const updatedIncoming = createBetOrder({
    ...incoming,
    matchedMinor: add(incoming.matchedMinor, incomingMatchedDelta),
    unmatchedMinor: plan.incomingRemainingMinor,
    status: nextStatus(plan.incomingRemainingMinor),
    updatedAt: now,
  });

  assertTransition(incoming.status, updatedIncoming.status, {
    actor: "SYSTEM",
    matchedMinor: updatedIncoming.matchedMinor,
    unmatchedMinor: updatedIncoming.unmatchedMinor,
  });

  await deps.betOrders(tx, incoming.userId).save(updatedIncoming);

  return updatedIncoming;
}
