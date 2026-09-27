import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { DomainError } from "@/domain/errors";
import { ResultActions } from "@/ui/admin/ResultActions";

interface MarketResultsPageProps {
  readonly params: Promise<{ id: string }>;
}

/** T-905 — resolves the viewing admin's own session (same double-check pattern as every other
 * account/admin page) so ResultActions can hide Confirm for the proposer. */
export default async function AdminMarketResultsPage({ params }: MarketResultsPageProps) {
  const { id } = await params;
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }
  const session = await container.sessionService.validateSession(token);

  let book;
  try {
    book = await container.getMarketBook.execute({ marketId: id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESOURCE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const result = await container.getMarketResult.execute({ marketId: id });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        Result — market {book.marketId}
      </h1>
      <ResultActions
        marketId={book.marketId}
        outcomes={book.outcomes.map((outcome) => ({ id: outcome.outcomeId, label: outcome.label }))}
        result={
          result && {
            id: result.id,
            status: result.status,
            proposedBy: result.proposedBy,
            winningOutcomeId: result.winningOutcomeId,
          }
        }
        viewerUserId={session.userId}
      />
    </section>
  );
}
