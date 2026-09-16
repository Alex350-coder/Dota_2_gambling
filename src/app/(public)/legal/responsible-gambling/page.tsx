import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Responsible Gambling Policy — P2P Arena" };

export default function ResponsibleGamblingPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Responsible Gambling Policy</h1>

      <h2>1. Age requirement</h2>
      <p>You must be 18 or older to register and place bets.</p>

      <h2>2. Limits</h2>
      <p>
        You can set deposit, stake, loss, and session limits from your account. Limit decreases take
        effect immediately; limit increases are subject to a cooling-off period before they take
        effect.
      </p>

      <h2>3. Self-exclusion</h2>
      <p>
        You can self-exclude your account. Self-exclusion is irrevocable for the duration you
        select.
      </p>

      <h2>4. Activity summary</h2>
      <p>Your account provides a summary of your betting activity and limits.</p>

      <h2>5. Support resources</h2>
      <p>
        Contact details for Peruvian problem-gambling support resources are{" "}
        <strong>EXTERNAL VALIDATION REQUIRED</strong>.
      </p>
    </>
  );
}
