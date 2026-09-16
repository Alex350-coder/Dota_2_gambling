import Link from "next/link";

const LEGAL_LINKS: readonly { href: string; label: string }[] = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/responsible-gambling", label: "Responsible Gambling" },
  { href: "/legal/age-requirement", label: "Age Requirement" },
  { href: "/legal/acceptable-use", label: "Acceptable Use" },
  { href: "/legal/risk-disclosure", label: "Risk Disclosure" },
  { href: "/legal/refund-cancellation", label: "Refund & Cancellation" },
  { href: "/legal/dispute-resolution", label: "Dispute Resolution" },
  { href: "/legal/payment-policy", label: "Payment Policy" },
  { href: "/legal/withdrawal-policy", label: "Withdrawal Policy" },
  { href: "/legal/security-disclosure", label: "Security Disclosure" },
];

export function Footer() {
  return (
    <footer className="border-t border-[var(--border-default)] bg-[var(--surface-1)]">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-[var(--text-secondary)]">
        <p className="mb-4">
          This is a portfolio engineering project. All amounts are simulated; no real money is ever
          involved.
        </p>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
