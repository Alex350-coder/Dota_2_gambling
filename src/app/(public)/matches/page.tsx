import Link from "next/link";
import { getContainer } from "@/platform/http/container";
import { EmptyState } from "@/ui/layout/EmptyState";

export const metadata = {
  title: "Matches — P2P Arena",
};

const DEFAULT_PAGE_SIZE = 20;

interface PageProps {
  readonly searchParams: Promise<{ page?: string }>;
}

function parsePage(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function MatchesPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const container = getContainer();
  const matches = await container.listMatches.execute({ page, limit: DEFAULT_PAGE_SIZE });

  const hasNextPage = matches.page * matches.limit < matches.total;
  const hasPrevPage = matches.page > 1;

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Matches</h1>

      {matches.items.length === 0 ? (
        <EmptyState message="No matches yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.items.map((match) => (
            <li key={match.id}>
              <Link
                href={`/matches/${match.id}`}
                className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3 hover:border-[var(--border-strong)]"
              >
                <span>Match {match.id.slice(0, 8)}</span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {match.scheduledAt.toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Pagination" className="flex justify-between text-sm">
        {hasPrevPage ? (
          <Link
            href={`/matches?page=${String(matches.page - 1)}`}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {hasNextPage && (
          <Link
            href={`/matches?page=${String(matches.page + 1)}`}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Next →
          </Link>
        )}
      </nav>
    </div>
  );
}
