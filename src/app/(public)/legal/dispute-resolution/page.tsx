import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Dispute Resolution — P2P Arena" };

export default function DisputeResolutionPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Dispute Resolution</h1>

      <h2>1. Raising a dispute</h2>
      <p>
        Contact channels for raising a dispute are <strong>EXTERNAL VALIDATION REQUIRED</strong>.
      </p>

      <h2>2. Result disputes</h2>
      <p>
        A dispute over a settled result is reviewed against the recorded match/tournament source
        used for settlement.
      </p>

      <h2>3. Timeframes</h2>
      <p>
        Response and resolution timeframes are <strong>LEGAL VALIDATION REQUIRED</strong> (they must
        account for jurisdiction-specific consumer-protection windows, not just an internal
        operational preference).
      </p>

      <h2>4. Escalation and consumer-protection route</h2>
      <p>
        <strong>LEGAL VALIDATION REQUIRED.</strong>
      </p>
    </>
  );
}
