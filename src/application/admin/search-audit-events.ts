import type {
  AuditEventFilter,
  AuditEventRecord,
  AuditEventRepository,
  UnitOfWork,
} from "@/domain/ports";
import { MAX_PAGE_SIZE } from "@/application/catalog/pagination";

export interface SearchAuditEventsInput extends AuditEventFilter {
  readonly page?: number;
  readonly limit?: number;
}

export interface SearchAuditEventsResult {
  readonly items: readonly AuditEventRecord[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface SearchAuditEventsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly auditEvents: (tx: Tx) => AuditEventRepository;
}

/** T-907 — `GET /admin/audit`, DB-level filter+pagination over the append-only audit trail. */
export class SearchAuditEventsUseCase<Tx> {
  constructor(private readonly deps: SearchAuditEventsDeps<Tx>) {}

  async execute(input: SearchAuditEventsInput): Promise<SearchAuditEventsResult> {
    const page = input.page !== undefined && input.page > 0 ? Math.floor(input.page) : 1;
    const limit =
      input.limit !== undefined && input.limit > 0
        ? Math.min(Math.floor(input.limit), MAX_PAGE_SIZE)
        : 20;

    const filter: AuditEventFilter = {
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
      ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
    };

    const { items, total } = await this.deps.uow.run((tx) =>
      this.deps.auditEvents(tx).search(filter, { limit, offset: (page - 1) * limit }),
    );

    return { items, total, page, limit };
  }
}
