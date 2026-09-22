import Link from "next/link";

const ADMIN_LINKS: readonly { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/markets", label: "Markets" },
  { href: "/admin/settlements", label: "Settlements" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/system", label: "System" },
];

export function AdminNav() {
  return (
    <nav aria-label="Admin" className="border-b border-[var(--border-default)]">
      <ul className="flex flex-wrap gap-4 pb-2">
        {ADMIN_LINKS.map((link) => (
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
