export const metadata = {
  title: "How it works — P2P Arena",
};

/**
 * Numbers below are copied verbatim from Claude/domain/BETTING_ENGINE.md §2 worked examples —
 * do not invent new figures here.
 */
export default function HowItWorksPage() {
  return (
    <article className="flex flex-col gap-8 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">How it works</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Peer-to-peer, fixed odds</h2>
        <p className="text-[var(--text-secondary)]">
          Every bet is matched against another user taking the opposite side of the same market, at
          fixed odds of <strong>1.8x</strong>. The platform never puts up capital and never takes a
          cut — the only fee is a <strong>20% commission</strong> paid to the streamer hosting the
          market, taken out of the matched pool.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Worked example — full match</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-left">
              <th className="py-2 pr-4">Actor</th>
              <th className="py-2 pr-4">Action</th>
              <th className="py-2">Result</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">User A</td>
              <td className="py-2 pr-4">stakes S/100 on WIN</td>
              <td className="py-2">wins</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">User B</td>
              <td className="py-2 pr-4">stakes S/100 on LOSE</td>
              <td className="py-2">loses</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Pool</td>
              <td className="py-2 pr-4"></td>
              <td className="py-2">S/200</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">A receives</td>
              <td className="py-2 pr-4">100 × 1.8</td>
              <td className="py-2">S/180 (S/100 stake + S/80 profit)</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Streamer receives</td>
              <td className="py-2 pr-4">100 × 0.2</td>
              <td className="py-2">S/20</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">B receives</td>
              <td className="py-2 pr-4"></td>
              <td className="py-2">S/0 (−100% stake)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">Platform</td>
              <td className="py-2 pr-4"></td>
              <td className="py-2">S/0</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Worked example — partial match</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-left">
              <th className="py-2 pr-4">Quantity</th>
              <th className="py-2">Value</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Requested (A)</td>
              <td className="py-2">10 000 (S/100)</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Matched</td>
              <td className="py-2">3 000 (S/30)</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Unmatched</td>
              <td className="py-2">7 000 (S/70)</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Matched return if A wins</td>
              <td className="py-2">3000 × 1.8 = 5 400 (S/54) → S/30 stake + S/24 profit</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Streamer commission</td>
              <td className="py-2">600 (S/6)</td>
            </tr>
            <tr className="border-b border-[var(--border-default)]">
              <td className="py-2 pr-4">Unmatched funds</td>
              <td className="py-2">7 000 released back to available balance</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-semibold">A&apos;s total after settlement</td>
              <td className="py-2 font-semibold">7 000 + 5 400 = 12 400 (S/124)</td>
            </tr>
          </tbody>
        </table>
        <p className="text-sm text-[var(--text-muted)]">
          Payout is computed only from the matched portion of a bet — the unmatched part is simply
          returned, never used as a payout base.
        </p>
      </section>
    </article>
  );
}
