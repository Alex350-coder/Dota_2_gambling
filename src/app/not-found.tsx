import Link from "next/link";
import { NavBar } from "@/ui/layout/NavBar";
import { Footer } from "@/ui/layout/Footer";

/**
 * `(public)/not-found.tsx` only renders when `notFound()` is called from within a matched
 * route segment. A path that matches no segment at all (a bad link, a typo) falls through to
 * this root-level boundary instead, outside the `(public)` layout — without its own
 * `data-theme` wrapper, none of the theme tokens resolve. This mirrors that page's content
 * inside its own themed wrapper so unmatched paths render the same as segment-level 404s.
 */

/**
 * Without this, Next statically prerenders `_not-found` once at build time with no per-request
 * CSP nonce on its inline hydration scripts (see middleware.ts) — the strict nonce-based CSP
 * then blocks every `__next_f.push(...)` script, so `RootNotFound`'s SSR HTML never hydrates
 * and never even paints (the browser is left with an empty `<body>`). Forcing dynamic rendering
 * makes Next bake the live per-request nonce in, exactly like `(public)/layout.tsx` does.
 */
export const dynamic = "force-dynamic";

export default function RootNotFound() {
  return (
    <div data-theme="default" className="flex min-h-screen flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="flex flex-col items-center gap-4 py-16 text-center text-[var(--text-primary)]">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="text-[var(--text-secondary)]">
            We couldn&apos;t find what you were looking for.
          </p>
          <Link
            href="/"
            className="rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-primary-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Back to home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
