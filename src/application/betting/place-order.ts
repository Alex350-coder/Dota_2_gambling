import { DomainError } from "@/domain/errors";
import { assertActiveAccount } from "@/domain/identity";
import { assertMarketAcceptingOrders } from "@/domain/catalog";
import { createBetOrder, type BetOrder } from "@/domain/betting";
import { negate, ZERO_MINOR, toMinor } from "@/domain/money";
import type {
  AllocationRepository,
  AuditWriter,
  BetOrderRepository,
  BetSlipRepository,
  BookRepository,
  Clock,
  EconomicProfileRepository,
  IdGenerator,
  LedgerWriter,
  MarketRepository,
  OutcomeRepository,
  StreamerRepository,
  UnitOfWork,
  UserRepository,
  WalletRepository,
} from "@/domain/ports";
import { betPlacedEvent } from "@/application/audit/writer";
import { matchIncomingOrder } from "./match";

/**
 * Reservation + matching share one transaction (T-515): a deadlock/serialization failure from
 * racing on the market's advisory lock or the book's `FOR UPDATE` scan retries the whole thing,
 * not just part of it — a partially-applied reservation with no matching attempt would leave
 * funds locked with no corresponding allocation.
 */
const PLACE_ORDER_TX_OPTIONS = {
  isolation: "READ COMMITTED",
  retry: { attempts: 3 },
} as const;

export interface PlaceOrderInput {
  readonly userId: string;
  readonly marketId: string;
  readonly outcomeId: string;
  readonly requestedMinor: bigint;
  readonly idempotencyKey: string;
}

export interface PlaceOrderDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly outcomes: (tx: Tx) => OutcomeRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly streamers: (tx: Tx) => StreamerRepository;
  readonly users: (tx: Tx) => UserRepository;
  readonly wallets: (tx: Tx, ownerId: string) => WalletRepository;
  readonly betSlips: (tx: Tx, ownerId: string) => BetSlipRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly book: (tx: Tx) => BookRepository;
  readonly allocations: (tx: Tx) => AllocationRepository;
  readonly acquireMarketLock: (tx: Tx, marketId: string) => Promise<void>;
  readonly ledger: LedgerWriter<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Placement preconditions, fund reservation, and FIFO matching (T-502, T-503, T-505..T-509) —
 * one `uow.run` transaction: reserve the stake, open the order, then attempt to match it
 * against the resting book before returning, per MATCHING_ENGINE.md (matching happens inline
 * with placement, not as a separate async step).
 */
export class PlaceOrderUseCase<Tx> {
  constructor(private readonly deps: PlaceOrderDeps<Tx>) {}

  async execute(input: PlaceOrderInput): Promise<BetOrder> {
    return this.deps.uow.run(async (tx) => {
      const market = await this.deps.markets(tx).findById(input.marketId);
      if (!market) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
          details: { marketId: input.marketId },
        });
      }
      const now = this.deps.clock.now();
      assertMarketAcceptingOrders(market, now);

      const outcomes = await this.deps.outcomes(tx).listByMarketId(input.marketId);
      const outcome = outcomes.find((candidate) => candidate.id === input.outcomeId);
      if (!outcome) {
        throw new DomainError("INVALID_OUTCOME", "outcome does not belong to this market", {
          details: { marketId: input.marketId, outcomeId: input.outcomeId },
        });
      }

      const economicProfile = await this.deps
        .economicProfiles(tx)
        .findById(market.economicProfileId);
      if (!economicProfile) {
        throw new DomainError("RESOURCE_NOT_FOUND", "economic profile not found", {
          details: { economicProfileId: market.economicProfileId },
        });
      }

      const requestedMinor = toMinor(input.requestedMinor);
      if (requestedMinor < economicProfile.minStakeMinor) {
        throw new DomainError("STAKE_BELOW_MINIMUM", "stake is below the market minimum", {
          details: {
            requestedMinor: requestedMinor.toString(),
            minStakeMinor: economicProfile.minStakeMinor.toString(),
          },
        });
      }
      if (requestedMinor > economicProfile.maxStakeMinor) {
        throw new DomainError("STAKE_ABOVE_MAXIMUM", "stake is above the market maximum", {
          details: {
            requestedMinor: requestedMinor.toString(),
            maxStakeMinor: economicProfile.maxStakeMinor.toString(),
          },
        });
      }

      const user = await this.deps.users(tx).findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }
      assertActiveAccount(user.status);

      const wallet = await this.deps
        .wallets(tx, input.userId)
        .findByCurrencyForUpdate(economicProfile.currency);
      if (!wallet) {
        throw new DomainError("CURRENCY_MISMATCH", "no wallet held in the market's currency", {
          details: { userId: input.userId, currency: economicProfile.currency },
        });
      }
      if (wallet.availableMinor < requestedMinor) {
        throw new DomainError("INSUFFICIENT_FUNDS", "insufficient available balance", {
          details: {
            available: wallet.availableMinor.toString(),
            requestedMinor: requestedMinor.toString(),
          },
        });
      }

      const orderId = this.deps.ids.next();

      const reservation = await this.deps.ledger.post(tx, {
        id: this.deps.ids.next(),
        kind: "RESERVE",
        referenceType: "bet_order",
        referenceId: orderId,
        idempotencyKey: `reserve:${orderId}`,
        actorType: "USER",
        actorId: input.userId,
        entries: [
          {
            accountKey: `USER_AVAILABLE:${input.userId}`,
            currency: economicProfile.currency,
            signedAmountMinor: negate(requestedMinor),
          },
          {
            accountKey: `USER_LOCKED:${input.userId}`,
            currency: economicProfile.currency,
            signedAmountMinor: requestedMinor,
          },
        ],
      });

      const betSlip = await this.deps.betSlips(tx, input.userId).create({
        id: this.deps.ids.next(),
        userId: input.userId,
        createdAt: now,
      });

      const order = createBetOrder({
        id: orderId,
        userId: input.userId,
        marketId: input.marketId,
        outcomeId: input.outcomeId,
        requestedMinor,
        matchedMinor: ZERO_MINOR,
        unmatchedMinor: requestedMinor,
        releasedMinor: ZERO_MINOR,
        oddsNum: economicProfile.oddsNum,
        oddsDen: economicProfile.oddsDen,
        commissionBps: economicProfile.streamerCommissionBps,
        status: "OPEN",
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now,
      });

      const created = await this.deps.betOrders(tx, input.userId).create({
        ...order,
        betSlipId: betSlip.id,
        currency: economicProfile.currency,
      });

      await this.deps.audit.record(tx, betPlacedEvent(input.userId, created.id, reservation.id));

      const streamer = await this.deps.streamers(tx).findById(market.streamerId);
      if (!streamer) {
        throw new DomainError("RESOURCE_NOT_FOUND", "streamer not found", {
          details: { streamerId: market.streamerId },
        });
      }

      return matchIncomingOrder(tx, this.deps, {
        marketId: market.id,
        currency: economicProfile.currency,
        streamerUserId: streamer.userId,
        incoming: created,
      });
    }, PLACE_ORDER_TX_OPTIONS);
  }
}
