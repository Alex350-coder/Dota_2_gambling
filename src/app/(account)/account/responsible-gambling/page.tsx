import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { Money } from "@/ui/money/Money";
import { LimitsPanel } from "@/ui/compliance/LimitsPanel";
import { SelfExclusionPanel } from "@/ui/compliance/SelfExclusionPanel";

export const metadata = {
  title: "Responsible gambling — P2P Arena",
};

export default async function ResponsibleGamblingPage() {
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }

  const session = await container.sessionService.validateSession(token);
  const currency = container.config.CURRENCY;

  const [limits, summary] = await Promise.all([
    container.listLimits.execute({ userId: session.userId }),
    container.activitySummary.execute({ userId: session.userId, currency, period: "ALL" }),
  ]);

  const limitRows = limits.map((limit) => ({
    kind: limit.kind,
    period: limit.period,
    currentValue: limit.currentValue.toString(),
    pendingValue: limit.pendingValue?.toString() ?? null,
    effectiveAt: limit.effectiveAt?.toISOString() ?? null,
    effectiveValue: limit.effectiveValue.toString(),
  }));

  return (
    <div className="flex flex-col gap-8 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Responsible gambling</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Limits</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Lowering a limit applies immediately. Raising one takes effect 24 hours after you confirm
          it.
        </p>
        <LimitsPanel initialLimits={limitRows} currency={currency} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Activity summary</h2>
        <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
          <div className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
            <dt className="text-sm text-[var(--text-secondary)]">Total staked</dt>
            <dd className="text-xl font-semibold">
              <Money amountMinor={summary.totalStakedMinor.toString()} currency={currency} />
            </dd>
          </div>
          <div className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
            <dt className="text-sm text-[var(--text-secondary)]">Total won</dt>
            <dd className="text-xl font-semibold">
              <Money amountMinor={summary.totalWonMinor.toString()} currency={currency} />
            </dd>
          </div>
          <div className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
            <dt className="text-sm text-[var(--text-secondary)]">Net result</dt>
            <dd className="text-xl font-semibold">
              <Money amountMinor={summary.netResultMinor.toString()} currency={currency} signed />
            </dd>
          </div>
          <div className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
            <dt className="text-sm text-[var(--text-secondary)]">Bets placed</dt>
            <dd className="text-xl font-semibold">{summary.betCount}</dd>
          </div>
          <div className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
            <dt className="text-sm text-[var(--text-secondary)]">Time on site</dt>
            <dd className="text-xl font-semibold">{summary.timeOnSiteMinutes} min</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Self-exclusion</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Self-excluding blocks your account from betting or funding for the period you choose. It
          cannot be lifted early.
        </p>
        <SelfExclusionPanel />
      </section>
    </div>
  );
}
