import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { BetHistoryPanel } from "@/ui/account/BetHistoryPanel";

export const metadata = {
  title: "Bet History — P2P Arena",
};

export default async function AccountBetsPage() {
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }

  const session = await container.sessionService.validateSession(token);
  const currency = container.config.CURRENCY;
  const page = await container.listBets.execute({ actorId: session.userId });

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Bet History</h1>
      <BetHistoryPanel
        initialOrders={page.items.map((order) => ({
          id: order.id,
          marketId: order.marketId,
          outcomeId: order.outcomeId,
          requestedMinor: order.requestedMinor.toString(),
          matchedMinor: order.matchedMinor.toString(),
          unmatchedMinor: order.unmatchedMinor.toString(),
          status: order.status,
          createdAt: order.createdAt.toISOString(),
        }))}
        initialMeta={{ total: page.total, page: page.page, limit: page.limit }}
        currency={currency}
      />
    </div>
  );
}
