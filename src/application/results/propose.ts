import { createHash } from "node:crypto";
import { DomainError } from "@/domain/errors";
import { assertTransitionMarketResult } from "@/domain/settlement";
import type {
  AuditWriter,
  Clock,
  IdGenerator,
  MarketRepository,
  MarketResult,
  MarketResultRepository,
  MatchResultProvider,
  OutcomeRepository,
  UnitOfWork,
} from "@/domain/ports";
import { resultProposedEvent } from "@/application/audit/writer";

export interface ProposeResultInput {
  readonly actorId: string;
  readonly marketId: string;
  /** `null` proposes a void result (no winner) — becomes a `VOID_PROPOSED` row instead of `PROPOSED`. */
  readonly winningOutcomeId: string | null;
  /** Verbatim provider payload, stored as-is for audit (`RESULT_PROVIDERS.md` §3). */
  readonly rawPayload: Record<string, unknown>;
}

export interface ProposeResultDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly outcomes: (tx: Tx) => OutcomeRepository;
  readonly marketResults: (tx: Tx) => MarketResultRepository;
  readonly provider: MatchResultProvider;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

function hashPayload(rawPayload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
}

/**
 * First step of the result lifecycle (`RESULT_PROVIDERS.md` §5): one admin proposes a winning
 * outcome. Never overwrites a prior row — a market that already has a non-`SUPERSEDED` result
 * must go through `dispute.ts`'s resolve path (T-604) to get a fresh one. Confirmation by a
 * second, distinct admin (T-603) is what actually authorises settlement.
 */
export class ProposeResultUseCase<Tx> {
  constructor(private readonly deps: ProposeResultDeps<Tx>) {}

  async execute(input: ProposeResultInput): Promise<MarketResult> {
    return this.deps.uow.run(async (tx) => {
      const market = await this.deps.markets(tx).findById(input.marketId);
      if (!market) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
          details: { marketId: input.marketId },
        });
      }
      if (market.status !== "CLOSED") {
        throw new DomainError(
          "MARKET_NOT_SETTLEABLE",
          "a result can only be proposed for a CLOSED market",
          { details: { marketId: market.id, status: market.status } },
        );
      }

      if (input.winningOutcomeId !== null) {
        const outcomes = await this.deps.outcomes(tx).listByMarketId(market.id);
        if (!outcomes.some((outcome) => outcome.id === input.winningOutcomeId)) {
          throw new DomainError(
            "INVALID_OUTCOME",
            "winning outcome does not belong to this market",
            {
              details: { marketId: market.id, winningOutcomeId: input.winningOutcomeId },
            },
          );
        }
      }

      const marketResults = this.deps.marketResults(tx);
      const current = await marketResults.findCurrentByMarketId(market.id);
      if (current) {
        throw new DomainError(
          "STALE_STATE",
          "a result already exists for this market; dispute and resolve it instead of proposing a new one",
          { details: { marketId: market.id, currentResultId: current.id, status: current.status } },
        );
      }

      const to = input.winningOutcomeId === null ? "VOID_PROPOSED" : "PROPOSED";
      assertTransitionMarketResult("PENDING", to, { proposerId: input.actorId });

      const result = await marketResults.create({
        id: this.deps.ids.next(),
        marketId: market.id,
        providerKey: this.deps.provider.key,
        trustLevel: this.deps.provider.trustLevel,
        winningOutcomeId: input.winningOutcomeId,
        rawPayload: input.rawPayload,
        payloadHash: hashPayload(input.rawPayload),
        status: to,
        proposedBy: input.actorId,
        createdAt: this.deps.clock.now(),
      });

      await this.deps.audit.record(tx, resultProposedEvent(input.actorId, result.id));

      return result;
    });
  }
}
