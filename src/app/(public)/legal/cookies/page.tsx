import { DraftBanner } from "@/ui/legal/DraftBanner";

export const metadata = { title: "Cookie Policy — P2P Arena" };

export default function CookiesPage() {
  return (
    <>
      <DraftBanner version="0.1.0" lastUpdated="2026-09-15" />
      <h1>Cookie Policy</h1>

      <h2>1. What we use</h2>
      <p>
        In this MVP we only use strictly necessary cookies: your session cookie, a CSRF token
        cookie, and a theme preference cookie.
      </p>

      <h2>2. What we don&apos;t use</h2>
      <p>No advertising cookies and no analytics cookies are set without your explicit consent.</p>
    </>
  );
}
