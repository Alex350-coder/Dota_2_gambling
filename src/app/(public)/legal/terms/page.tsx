import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Terms of Service — P2P Arena" };

export default function TermsPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Terms of Service</h1>

      <h2>1. What this platform is</h2>
      <p>
        This is a portfolio engineering project: a peer-to-peer (matched) esports betting
        simulation. No real money is ever deposited, wagered, or paid out. All balances and bet
        amounts are simulated credits.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be 18 years or older to register an account. You must accurately declare your age.
        False declaration of age is grounds for immediate account termination.
      </p>

      <h2>3. How bets work</h2>
      <p>
        The platform does not provide capital: every bet is funded by, and matched against, another
        user&apos;s bet on the opposing outcome. Odds are fixed at 1.8x on both sides of a market. A
        streamer hosting a market earns a 20% commission on matched stakes, regardless of which side
        wins — this is a disclosed conflict of interest. Bets may be matched in full, partially, or
        not at all; only the matched portion of a stake is at risk. Unmatched stake is never exposed
        to the outcome and can be cancelled.
      </p>

      <h2>4. Account rules</h2>
      <p>
        One account per person. Accounts are personal and non-transferable. See the Acceptable Use
        Policy for prohibited behaviour.
      </p>

      <h2>5. Settlement</h2>
      <p>
        Markets are settled against the recorded match/tournament result. Settlement rules and void
        conditions are described in the Risk Disclosure and Refund &amp; Cancellation policies.
      </p>

      <h2>6. Suspension and termination</h2>
      <p>
        The platform may suspend or terminate an account for violation of these Terms or the
        Acceptable Use Policy.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        This is an engineering demonstration operating exclusively on simulated money. To the extent
        this were ever operated as a real-money service, limitation-of-liability language and
        governing law require legal drafting. <strong>LEGAL VALIDATION REQUIRED.</strong>
      </p>

      <h2>8. Governing law</h2>
      <p>
        <strong>LEGAL VALIDATION REQUIRED.</strong>
      </p>
    </>
  );
}
