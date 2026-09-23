import Link from "next/link";
import { getContainer } from "@/platform/http/container";

interface SettlementsPageProps {
  readonly searchParams: Promise<{ page?: string }>;
}

/** T-906 — reuses ListSettlementRunsUseCase (T-613); no admin-only field needed for an overview. */
export default async function AdminSettlementsPage({ searchParams }: SettlementsPageProps) {
  const { page } = await searchParams;
  const container = getContainer();
  const result = await container.listSettlementRuns.execute({
    page: page ? Number(page) : undefined,
  });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Settlement runs</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
            <th className="py-2">Market</th>
            <th className="py-2">Status</th>
            <th className="py-2">Progress</th>
            <th className="py-2">Retries</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((run) => (
            <tr key={run.id} className="border-b border-[var(--border-default)]">
              <td className="py-2">
                <Link
                  href={`/admin/settlements/${run.id}`}
                  className="text-[var(--text-primary)] underline"
                >
                  {run.marketId}
                </Link>
              </td>
              <td className="py-2 text-[var(--text-primary)]">{run.status}</td>
              <td className="py-2 text-[var(--text-secondary)]">
                {run.allocationsSettled}/{run.allocationsTotal}
              </td>
              <td className="py-2 text-[var(--text-secondary)]">{run.retryCount}</td>
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
