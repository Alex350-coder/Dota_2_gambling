import { notFound } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { DomainError } from "@/domain/errors";
import { Money } from "@/ui/money/Money";
import { SettlementRetryButton } from "@/ui/admin/SettlementRetryButton";

interface SettlementDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function AdminSettlementDetailPage({ params }: SettlementDetailPageProps) {
  const { id } = await params;
  const container = getContainer();

  let run;
  try {
    run = await container.getSettlementRun.execute({ id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESOURCE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        Settlement — market {run.marketId}
      </h1>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Progress</dt>
          <dd className="text-[var(--text-primary)]">
            {run.allocationsSettled}/{run.allocationsTotal}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Retries</dt>
          <dd className="text-[var(--text-primary)]">{run.retryCount}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Payout total</dt>
          <dd className="text-[var(--text-primary)]">
            <Money
              amountMinor={run.payoutTotalMinor.toString()}
              currency={container.config.CURRENCY}
            />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Commission total</dt>
          <dd className="text-[var(--text-primary)]">
            <Money
              amountMinor={run.commissionTotalMinor.toString()}
              currency={container.config.CURRENCY}
            />
          </dd>
        </div>
      </dl>
      <SettlementRetryButton runId={run.id} status={run.status} />
    </section>
  );
}
