import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Age Requirement — P2P Arena" };

export default function AgeRequirementPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Age Requirement</h1>

      <h2>1. Minimum age</h2>
      <p>You must be at least 18 years old to register an account on this platform.</p>

      <h2>2. Declaration</h2>
      <p>
        During registration you declare that your stated date of birth is accurate and that you meet
        the minimum age requirement.
      </p>

      <h2>3. Consequences of a false declaration</h2>
      <p>
        An account found to have been registered under a false age declaration is subject to
        immediate suspension or termination under the Terms of Service.
      </p>
    </>
  );
}
