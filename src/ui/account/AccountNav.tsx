import Link from "next/link";

const ACCOUNT_LINKS: readonly { href: string; label: string }[] = [
  { href: "/account", label: "Profile" },
  { href: "/account/security", label: "Security" },
  { href: "/account/sessions", label: "Sessions" },
  { href: "/account/wallet", label: "Wallet" },
  { href: "/account/transactions", label: "Transactions" },
];

export function AccountNav() {
  return (
    <nav aria-label="Account" className="border-b border-[var(--border-default)]">
      <ul className="flex flex-wrap gap-4 pb-2">
        {ACCOUNT_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
