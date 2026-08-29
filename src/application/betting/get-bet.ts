import { DomainError } from "@/domain/errors";
import type { BetOrder } from "@/domain/betting";
import type {
  AllocationRepository,
  BetOrderRepository,
  MatchAllocation,
  UnitOfWork,
} from "@/domain/ports";

export interface GetBetInput {
  readonly actorId: string;
  readonly orderId: string;
}

export interface GetBetResult {
  readonly order: BetOrder;
  readonly allocations: readonly MatchAllocation[];
}

export interface GetBetDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly allocations: (tx: Tx, ownerId: string) => AllocationRepository;
}

/**
 * Owner-scoped detail lookup (T-513). Cross-user access is indistinguishable from
 * "does not exist" — `RESOURCE_NOT_FOUND` (404), never a 403, per RULE-E02. Allocation
 * rows never expose the counterparty's user id, only the two order ids.
 */
export class GetBetUseCase<Tx> {
  constructor(private readonly deps: GetBetDeps<Tx>) {}

  async execute(input: GetBetInput): Promise<GetBetResult> {
    return this.deps.uow.run(async (tx) => {
      const order = await this.deps.betOrders(tx, input.actorId).findById(input.orderId);
      if (!order) {
        throw new DomainError("RESOURCE_NOT_FOUND", "bet order not found", {
          details: { orderId: input.orderId },
        });
      }

      const allocations = await this.deps.allocations(tx, input.actorId).findByOrderId(order.id);
      return { order, allocations };
    });
  }
}
