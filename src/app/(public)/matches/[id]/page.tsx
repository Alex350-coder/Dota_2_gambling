import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { MarketStatusBadge } from "@/ui/catalog/MarketStatusBadge";

/** Catalog is small enough that one page covers it all — see the games listing page for the same cap. */
const MARKETS_PAGE_LIMIT = 50;

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params;
  const container = getContainer();

  let match;
  try {
    match = await container.getMatch.execute({ id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESOURCE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const markets = await container.listMarkets.execute({ limit: MARKETS_PAGE_LIMIT });
  const marketsForMatch = markets.items.filter((market) => market.matchId === match.id);

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Match {match.id.slice(0, 8)}</h1>
      <p className="text-[var(--text-secondary)]">
        Scheduled for {match.scheduledAt.toLocaleString()}
        {match.playedAt && ` — played ${match.playedAt.toLocaleString()}`}
      </p>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Markets</h2>
        {marketsForMatch.length === 0 ? (
          <p className="text-[var(--text-muted)]">No markets for this match yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {marketsForMatch.map((market) => (
              <li key={market.id}>
                <Link
                  href={`/markets/${market.id}`}
                  className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3 hover:border-[var(--border-strong)]"
                >
                  <span>Market {market.id.slice(0, 8)}</span>
                  <MarketStatusBadge status={market.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
