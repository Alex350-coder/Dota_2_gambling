import { notFound } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { MarketStatusBadge } from "@/ui/catalog/MarketStatusBadge";
import { MarketBettingPanel } from "@/ui/betting/MarketBettingPanel";
import { Money } from "@/ui/money/Money";

const idSchema = z.uuid();

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function MarketDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    notFound();
  }
  const id = parsedId.data;

  const container = getContainer();

  let market;
  let book;
  let streamer;
  try {
    [market, book] = await Promise.all([
      container.getMarket.execute({ id }),
      container.getMarketBook.execute({ marketId: id }),
    ]);
    streamer = await container.getStreamer.execute({ id: market.streamerId });
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESOURCE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const currency = container.config.CURRENCY;

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Market {market.id.slice(0, 8)}</h1>
        <MarketStatusBadge status={market.status} />
      </div>

      <p className="text-[var(--text-secondary)]">
        Closes at {market.closesAt.toLocaleString()} — hosted by {streamer.displayName}.
      </p>

      <div
        role="note"
        aria-label="Streamer commission disclosure"
        className="rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]"
      >
        {streamer.displayName} earns a {(streamer.defaultCommissionBps / 100).toFixed(1)}%
        commission on matched stakes in this market. This is a conflict of interest: the streamer
        benefits from higher betting volume regardless of outcome.
      </div>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Outcomes</h2>
        <ul className="flex flex-col gap-2">
          {book.outcomes.map((outcome) => (
            <li
              key={outcome.outcomeId}
              className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3"
            >
              <span>{outcome.label}</span>
              <span className="text-sm text-[var(--text-secondary)]">
                Unmatched liquidity:{" "}
                <Money amountMinor={outcome.unmatchedStake} currency={currency} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {market.status === "OPEN" && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">Place a bet</h2>
          <MarketBettingPanel
            marketId={market.id}
            currency={currency}
            outcomes={book.outcomes.map((outcome) => ({
              outcomeId: outcome.outcomeId,
              label: outcome.label,
            }))}
          />
        </section>
      )}
    </div>
  );
}
