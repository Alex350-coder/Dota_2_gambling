import Link from "next/link";
import { getContainer } from "@/platform/http/container";

interface MarketsPageProps {
  readonly searchParams: Promise<{ page?: string }>;
}

/** T-904 — reuses the existing public ListMarketsUseCase (T-410); no admin-only field needed
 * for a status/id overview list. */
export default async function AdminMarketsPage({ searchParams }: MarketsPageProps) {
  const { page } = await searchParams;
  const container = getContainer();
  const result = await container.listMarkets.execute({ page: page ? Number(page) : undefined });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Markets</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
            <th className="py-2">Market</th>
            <th className="py-2">Status</th>
            <th className="py-2">Closes</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((market) => (
            <tr key={market.id} className="border-b border-[var(--border-default)]">
              <td className="py-2">
                <Link
                  href={`/admin/markets/${market.id}`}
                  className="text-[var(--text-primary)] underline"
                >
                  {market.id}
                </Link>
              </td>
              <td className="py-2 text-[var(--text-primary)]">{market.status}</td>
              <td className="py-2 text-[var(--text-secondary)]">{market.closesAt.toISOString()}</td>
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
