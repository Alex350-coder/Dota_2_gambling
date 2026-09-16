import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Refund & Cancellation Policy — P2P Arena" };

export default function RefundCancellationPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Refund &amp; Cancellation Policy</h1>

      <h2>1. Cancelling unmatched stake</h2>
      <p>
        The unmatched portion of a bet order can be cancelled at any time before it is matched.
        Cancelled unmatched stake is returned to your simulated balance in full.
      </p>

      <h2>2. Matched exposure cannot be cancelled</h2>
      <p>
        Once a portion of your stake is matched, that portion cannot be cancelled — it is settled
        against the market&apos;s outcome.
      </p>

      <h2>3. Void markets</h2>
      <p>
        If a market is voided, all matched stakes in that market are refunded in full to the
        participants.
      </p>

      <h2>4. No discretionary refunds</h2>
      <p>Settled losing bets are not refunded at the platform&apos;s discretion.</p>
    </>
  );
}
