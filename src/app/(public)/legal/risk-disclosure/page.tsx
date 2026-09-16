import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Risk Disclosure — P2P Arena" };

export default function RiskDisclosurePage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Risk Disclosure</h1>

      <h2>1. Simulated money</h2>
      <p>
        All amounts on this platform are simulated credits. No real money is ever deposited,
        wagered, or paid out.
      </p>

      <h2>2. Matched funds are at risk</h2>
      <p>
        Once your stake is matched against an opposing bet, it is fully at risk. If your outcome
        loses, you lose 100% of the matched portion of your stake. Unmatched stake is never exposed
        to the outcome and can be cancelled at any time before it is matched.
      </p>

      <h2>3. Partial matching</h2>
      <p>
        A bet may be matched in full, in part, or not at all, depending on the opposing liquidity
        available in the market at the time.
      </p>

      <h2>4. Result and dispute risk</h2>
      <p>
        Markets settle against the recorded match/tournament result. See the Dispute Resolution
        policy for how disputed results are handled.
      </p>

      <h2>5. No guaranteed returns</h2>
      <p>
        Fixed odds of 1.8x apply to the matched portion of a winning bet, but no outcome, return, or
        profit is guaranteed.
      </p>
    </>
  );
}
