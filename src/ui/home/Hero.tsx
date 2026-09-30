import Link from "next/link";
import { HeroBackground } from "./HeroBackground";
import { HeroMarketPreview } from "./HeroMarketPreview";

/**
 * Public homepage hero (T-717). Content is server-rendered; only the decorative
 * background (HeroBackground) is a client island, so it hydrates after first paint and
 * never gates it (MET-PERF-01: TTFB via plain SSR).
 */
export function Hero() {
  return (
    <section className="relative flex min-h-[80vh] flex-col justify-center overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-0)] px-6 py-16 sm:px-10">
      <HeroBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-start gap-6">
        <span className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 py-1 text-xs font-semibold tracking-widest text-[var(--accent-secondary)] uppercase">
          Esports betting
        </span>
        <h1 className="text-4xl leading-[1.05] font-bold text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
          Bet on the game.
          <br />
          Back the moment.
        </h1>
        <p className="max-w-xl text-lg text-[var(--text-secondary)]">
          A spectator-driven betting platform where matched bets compete against each other, at
          fixed 1.8x odds. Every amount here is simulated —{" "}
          <Link href="/how-it-works" className="underline hover:text-[var(--text-primary)]">
            see how it works
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/games"
            className="rounded-lg bg-[var(--accent-primary)] px-6 py-3 text-sm font-semibold text-[var(--accent-primary-contrast)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Explore the Arena
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-lg border border-[var(--border-strong)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            How it works
          </Link>
        </div>
        <HeroMarketPreview />
      </div>
    </section>
  );
}
