const PREVIEW_ODDS = "1.8x";

/**
 * Purely illustrative — no real market/order data, no financial computation (T-717).
 * Mirrors the fixed 1.8x / 20% streamer split from how-it-works, but renders static
 * numbers only and is clearly labelled as a simulation.
 */
export function HeroMarketPreview() {
  return (
    <div
      aria-label="Illustrative market preview, simulation only"
      className="grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)]/80 p-4 sm:max-w-lg"
    >
      <PreviewSide label="Player A" amount="$100" outcome="WIN" tone="positive" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs tracking-wide text-[var(--text-muted)] uppercase">vs</span>
        <span className="rounded-full bg-[var(--accent-primary)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-primary-contrast)]">
          {PREVIEW_ODDS}
        </span>
      </div>
      <PreviewSide label="Player B" amount="$100" outcome="LOSE" tone="negative" align="end" />
      <div className="col-span-3 flex items-center justify-between border-t border-[var(--border-default)] pt-3 text-xs text-[var(--text-muted)]">
        <span>Streamer commission</span>
        <span className="text-[var(--text-secondary)]">$20</span>
      </div>
      <p className="col-span-3 text-[10px] tracking-wide text-[var(--text-muted)] uppercase">
        Simulation mode — illustrative only, not a live market
      </p>
    </div>
  );
}

interface PreviewSideProps {
  readonly label: string;
  readonly amount: string;
  readonly outcome: "WIN" | "LOSE";
  readonly tone: "positive" | "negative";
  readonly align?: "start" | "end";
}

function PreviewSide({ label, amount, outcome, tone, align = "start" }: PreviewSideProps) {
  const toneClass =
    tone === "positive" ? "text-[var(--money-positive)]" : "text-[var(--money-negative)]";
  const alignClass = align === "end" ? "items-end text-right" : "items-start";

  return (
    <div className={`flex flex-col gap-0.5 ${alignClass}`}>
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-lg font-semibold text-[var(--text-primary)]">{amount}</span>
      <span className={`text-xs font-semibold uppercase ${toneClass}`}>{outcome}</span>
    </div>
  );
}
