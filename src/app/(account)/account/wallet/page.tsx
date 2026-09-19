import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { Money } from "@/ui/money/Money";

export const metadata = {
  title: "Wallet — P2P Arena",
};

export default async function AccountWalletPage() {
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }

  const session = await container.sessionService.validateSession(token);
  const { wallet, lockedByMarket } = await container.getWallet.execute({
    userId: session.userId,
    currency: container.config.CURRENCY,
  });

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Wallet</h1>
        {container.config.MONEY_MODE === "SIMULATED" && (
          <span className="rounded border border-[var(--state-info)] px-2 py-0.5 text-xs font-medium text-[var(--state-info)]">
            SIMULATED
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
          <dt className="text-sm text-[var(--text-secondary)]">Available</dt>
          <dd className="text-2xl font-semibold">
            <Money amountMinor={wallet.availableMinor.toString()} currency={wallet.currency} />
          </dd>
        </div>
        <div className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
          <dt className="text-sm text-[var(--text-secondary)]">Locked</dt>
          <dd className="text-2xl font-semibold">
            <Money amountMinor={wallet.lockedMinor.toString()} currency={wallet.currency} />
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Locked by market</h2>
        {lockedByMarket.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No funds are currently locked in open orders.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lockedByMarket.map((entry) => (
              <li
                key={entry.marketId}
                className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3"
              >
                <span className="text-sm text-[var(--text-secondary)]">
                  Market {entry.marketId.slice(0, 8)}
                </span>
                <Money amountMinor={entry.lockedMinor.toString()} currency={wallet.currency} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
