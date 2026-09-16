import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Security Disclosure — P2P Arena" };

export default function SecurityDisclosurePage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Security / Vulnerability Disclosure</h1>

      <h2>1. Scope</h2>
      <p>
        This policy covers vulnerabilities in this platform&apos;s code and infrastructure as
        described in the project&apos;s <code>SECURITY.md</code>.
      </p>

      <h2>2. Safe harbour</h2>
      <p>
        Good-faith security research conducted under this policy, without accessing or exfiltrating
        other users&apos; data beyond what is necessary to demonstrate a finding, will not be
        treated as a violation of the Acceptable Use Policy.
      </p>

      <h2>3. Reporting channel</h2>
      <p>
        Report a vulnerability through the project&apos;s GitHub private vulnerability reporting
        feature.
      </p>

      <h2>4. Response targets</h2>
      <p>
        Response-time targets are tracked as <code>MET-SEC-09</code> in the project&apos;s metrics.
      </p>

      <h2>5. No bounty</h2>
      <p>This is a portfolio project and does not offer a monetary bug bounty.</p>
    </>
  );
}
