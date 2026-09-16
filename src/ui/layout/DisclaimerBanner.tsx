/**
 * RULE-K03 / MET-RG-05: every page must display the simulated-money disclaimer while
 * `MONEY_MODE=SIMULATED`. Rendered from the shared `(public)` layout so no page can ship
 * without it (Plan.md P7 acceptance criteria: "disclaimer on every page").
 */
export function DisclaimerBanner() {
  return (
    <div
      role="note"
      aria-label="Simulated money notice"
      className="border-b border-[var(--border-default)] bg-[var(--state-warning)] px-4 py-2 text-center text-sm font-medium text-[var(--surface-0)]"
    >
      This site uses simulated money only. No real currency is deposited, wagered, or paid out.
    </div>
  );
}
