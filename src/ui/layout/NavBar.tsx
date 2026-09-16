import Link from "next/link";

const NAV_LINKS: readonly { href: string; label: string }[] = [
  { href: "/games", label: "Games" },
  { href: "/matches", label: "Matches" },
  { href: "/streamers", label: "Streamers" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

export function NavBar() {
  return (
    <header className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3"
      >
        <Link
          href="/"
          className="rounded text-lg font-bold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          P2P Arena
        </Link>
        <ul className="flex flex-wrap items-center gap-4">
          {NAV_LINKS.map((link) => (
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
    </header>
  );
}
