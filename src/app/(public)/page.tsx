import Link from "next/link";
import { getContainer } from "@/platform/http/container";
import { MarketStatusBadge } from "@/ui/catalog/MarketStatusBadge";
import { EmptyState } from "@/ui/layout/EmptyState";

const HOME_PAGE_LIMIT = 5;

/**
 * MET-PERF-01 (TTFB <= 300ms): a single plain server-rendered fetch per list, no client-side
 * waterfall. Repository-level entities have no joined display names yet (T-410 scope), so this
 * shows what's actually available (status, dates, commission) and links out to the full,
 * richer per-entity pages built in later commits.
 */
export default async function HomePage() {
  const container = getContainer();

  const [markets, matches, streamers] = await Promise.all([
    container.listMarkets.execute({ limit: HOME_PAGE_LIMIT }),
    container.listMatches.execute({ limit: HOME_PAGE_LIMIT }),
    container.listStreamers.execute({ limit: HOME_PAGE_LIMIT }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
          Peer-to-peer esports betting, simulated money only
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--text-secondary)]">
          Fixed 1.8x odds, streamer-hosted markets, no house edge. Every amount on this site is
          simulated — see{" "}
          <Link href="/how-it-works" className="underline hover:text-[var(--text-primary)]">
            how it works
          </Link>
          .
        </p>
      </section>

      <HomeSection title="Markets" viewAllHref="/matches" emptyLabel="No markets yet.">
        {markets.items.map((market) => (
          <li
            key={market.id}
            className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3"
          >
            <Link
              href={`/markets/${market.id}`}
              className="text-[var(--text-primary)] hover:underline"
            >
              Market {market.id.slice(0, 8)}
            </Link>
            <MarketStatusBadge status={market.status} />
          </li>
        ))}
      </HomeSection>

      <HomeSection title="Upcoming matches" viewAllHref="/matches" emptyLabel="No matches yet.">
        {matches.items.map((match) => (
          <li
            key={match.id}
            className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3"
          >
            <Link
              href={`/matches/${match.id}`}
              className="text-[var(--text-primary)] hover:underline"
            >
              Match {match.id.slice(0, 8)}
            </Link>
            <span className="text-sm text-[var(--text-secondary)]">
              {match.scheduledAt.toLocaleString()}
            </span>
          </li>
        ))}
      </HomeSection>

      <HomeSection title="Streamers" viewAllHref="/streamers" emptyLabel="No streamers yet.">
        {streamers.items.map((streamer) => (
          <li
            key={streamer.id}
            className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3"
          >
            <Link
              href={`/streamers/${streamer.id}`}
              className="text-[var(--text-primary)] hover:underline"
            >
              {streamer.displayName}
            </Link>
            <span className="text-sm text-[var(--text-secondary)]">
              {(streamer.defaultCommissionBps / 100).toFixed(1)}% commission
            </span>
          </li>
        ))}
      </HomeSection>
    </div>
  );
}

interface HomeSectionProps {
  title: string;
  viewAllHref: string;
  emptyLabel: string;
  children: React.ReactNode;
}

function HomeSection({ title, viewAllHref, emptyLabel, children }: HomeSectionProps) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
        <Link
          href={viewAllHref}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          View all
        </Link>
      </div>
      {hasChildren ? (
        <ul className="flex flex-col gap-2">{children}</ul>
      ) : (
        <EmptyState message={emptyLabel} />
      )}
    </section>
  );
}
