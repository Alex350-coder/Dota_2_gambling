import Link from "next/link";
import { notFound } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { DomainError } from "@/domain/errors";
import { MarketActions } from "@/ui/admin/MarketActions";

interface MarketDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function AdminMarketDetailPage({ params }: MarketDetailPageProps) {
  const { id } = await params;
  const container = getContainer();

  let market;
  try {
    market = await container.getMarket.execute({ id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESOURCE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Market {market.id}</h1>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Match</dt>
          <dd className="text-[var(--text-primary)]">{market.matchId}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Closes</dt>
          <dd className="text-[var(--text-primary)]">{market.closesAt.toISOString()}</dd>
        </div>
      </dl>
      <MarketActions marketId={market.id} status={market.status} />
      <Link
        href={`/admin/markets/${market.id}/results`}
        className="self-start text-sm text-[var(--text-primary)] underline"
      >
        View result / 4-eyes confirmation
      </Link>
    </section>
  );
}
