import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Payment Policy — P2P Arena" };

export default function PaymentPolicyPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Payment Policy</h1>

      <h2>1. Simulated credits (current scope)</h2>
      <p>
        In this MVP, all balances are simulated credits. There is no real payment method, no real
        money deposit, and no real fee.
      </p>

      <h2>2. If real-money operation is ever enabled</h2>
      <p>
        Accepted payment methods, fees, processing timelines, and payment-provider terms would need
        to be defined and reviewed before any real-money launch.{" "}
        <strong>EXTERNAL VALIDATION REQUIRED</strong>.
      </p>
    </>
  );
}
