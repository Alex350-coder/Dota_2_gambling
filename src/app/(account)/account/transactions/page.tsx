import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { TransactionsPanel } from "@/ui/account/TransactionsPanel";

export const metadata = {
  title: "Transactions — P2P Arena",
};

export default async function AccountTransactionsPage() {
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }

  const session = await container.sessionService.validateSession(token);
  const currency = container.config.CURRENCY;
  const page = await container.listTransactions.execute({
    userId: session.userId,
    currency,
  });

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Transactions</h1>
      <TransactionsPanel
        initialTransactions={page.items.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          currency: entry.currency,
          signedAmountMinor: entry.signedAmountMinor.toString(),
          createdAt: entry.createdAt.toISOString(),
        }))}
        initialMeta={{ total: page.total, page: page.page, limit: page.limit }}
        currency={currency}
      />
    </div>
  );
}
