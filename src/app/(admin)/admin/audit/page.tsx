import { getContainer } from "@/platform/http/container";

interface AuditPageProps {
  readonly searchParams: Promise<{
    page?: string;
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
  }>;
}

/** T-907 — server-fetched via SearchAuditEventsUseCase directly; the `<form method="get">`
 * below round-trips filters through the URL, no client-side fetching needed. */
export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const filters = await searchParams;
  const container = getContainer();
  const result = await container.searchAuditEvents.execute({
    ...(filters.page ? { page: Number(filters.page) } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
  });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Audit search</h1>
      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="action"
          defaultValue={filters.action}
          placeholder="Action (e.g. USER_SUSPENDED)"
          className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
        />
        <input
          name="entityType"
          defaultValue={filters.entityType}
          placeholder="Entity type"
          className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
        />
        <input
          name="entityId"
          defaultValue={filters.entityId}
          placeholder="Entity id"
          className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
        />
        <input
          name="actorId"
          defaultValue={filters.actorId}
          placeholder="Actor id"
          className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
        />
        <button
          type="submit"
          className="rounded border border-[var(--border-default)] px-4 py-1 text-sm font-medium text-[var(--text-primary)]"
        >
          Search
        </button>
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
            <th className="py-2">When</th>
            <th className="py-2">Actor</th>
            <th className="py-2">Action</th>
            <th className="py-2">Entity</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((event) => (
            <tr key={event.id} className="border-b border-[var(--border-default)]">
              <td className="py-2 text-[var(--text-secondary)]">{event.createdAt.toISOString()}</td>
              <td className="py-2 text-[var(--text-primary)]">
                {event.actorType}:{event.actorId ?? "—"}
              </td>
              <td className="py-2 text-[var(--text-primary)]">{event.action}</td>
              <td className="py-2 text-[var(--text-secondary)]">
                {event.entityType}:{event.entityId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-[var(--text-secondary)]">
        Page {result.page} of {Math.max(1, Math.ceil(result.total / result.limit))} · {result.total}{" "}
        total
      </p>
    </section>
  );
}
