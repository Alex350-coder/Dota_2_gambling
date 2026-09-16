import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Privacy Policy — P2P Arena" };

export default function PrivacyPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Privacy Policy</h1>

      <h2>1. Data we collect</h2>
      <p>
        Email address, date of birth (for age verification), a hash of your IP address, device
        information, and your betting/financial activity records (all denominated in simulated
        currency).
      </p>

      <h2>2. Why we collect it</h2>
      <p>
        To create and secure your account, verify eligibility (18+), operate the matching engine,
        prevent abuse, and comply with applicable law.
      </p>

      <h2>3. Legal basis</h2>
      <p>
        Contract performance (operating your account) and legitimate interest (fraud prevention,
        security). <strong>LEGAL VALIDATION REQUIRED</strong> for a jurisdiction-specific basis.
      </p>

      <h2>4. Retention</h2>
      <p>
        Account and betting records are retained for as long as the account is active plus a
        reasonable period for dispute resolution and audit.
      </p>

      <h2>5. Sharing</h2>
      <p>We do not share personal data with advertisers. No data is sold.</p>

      <h2>6. Your rights</h2>
      <p>
        Peruvian users have rights under Ley 29733 (access, rectification, cancellation,
        opposition). Contact details for exercising these rights are{" "}
        <strong>EXTERNAL VALIDATION REQUIRED</strong>.
      </p>

      <h2>7. Cross-border transfer</h2>
      <p>
        <strong>LEGAL VALIDATION REQUIRED.</strong>
      </p>
    </>
  );
}
