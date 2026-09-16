import Link from "next/link";
import { getContainer } from "@/platform/http/container";
import { EmptyState } from "@/ui/layout/EmptyState";

export const metadata = {
  title: "Streamers — P2P Arena",
};

/** Catalog is small enough that one page covers it all — see the games listing page for the same cap. */
const STREAMERS_PAGE_LIMIT = 50;

export default async function StreamersPage() {
  const container = getContainer();
  const streamers = await container.listStreamers.execute({ limit: STREAMERS_PAGE_LIMIT });

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Streamers</h1>
      <p className="text-[var(--text-secondary)]">
        Streamers host markets and earn a commission on matched stakes — this is a conflict of
        interest: they benefit from higher betting volume regardless of outcome.
      </p>

      {streamers.items.length === 0 ? (
        <EmptyState message="No streamers yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {streamers.items.map((streamer) => (
            <li key={streamer.id}>
              <Link
                href={`/streamers/${streamer.id}`}
                className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3 hover:border-[var(--border-strong)]"
              >
                <span>{streamer.displayName}</span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {(streamer.defaultCommissionBps / 100).toFixed(1)}% commission
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
