import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Withdrawal Policy — P2P Arena" };

export default function WithdrawalPolicyPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Withdrawal Policy</h1>

      <h2>1. Simulated withdrawals (current scope)</h2>
      <p>
        In this MVP, withdrawals move simulated credits only — there is no real money to withdraw.
      </p>

      <h2>2. If real-money operation is ever enabled</h2>
      <p>
        Identity verification requirements, withdrawal limits, processing timelines, and grounds for
        placing a withdrawal on hold would need to be defined and reviewed before any real-money
        launch. <strong>EXTERNAL VALIDATION REQUIRED</strong>.
      </p>
    </>
  );
}
