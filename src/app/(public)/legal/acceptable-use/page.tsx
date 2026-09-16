import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Acceptable Use Policy — P2P Arena" };

export default function AcceptableUsePage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Acceptable Use Policy</h1>

      <h2>1. Prohibited behaviour</h2>
      <ul>
        <li>Operating more than one account (multi-accounting)</li>
        <li>Colluding with another user to manipulate a market</li>
        <li>Using automation, bots, or scripts to place or manage bets</li>
        <li>Scraping the platform&apos;s data</li>
        <li>Exploiting a software defect for financial or competitive advantage</li>
        <li>Attempting to influence the outcome of a match or tournament</li>
      </ul>

      <h2>2. Consequences</h2>
      <p>
        Violations may result in suspension or termination of your account and forfeiture of
        unmatched simulated balances, at the platform&apos;s discretion, under the Terms of Service.
      </p>
    </>
  );
}
