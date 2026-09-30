import { headers } from "next/headers";
import { GlassHeadlineHero } from "./GlassHeadlineHero";
import { HeroMarketPreview } from "./HeroMarketPreview";

/**
 * Public homepage hero (T-717). GlassHeadlineHero owns its own content (eyebrow, headline,
 * description, CTAs) and the WebGL2 background; HeroMarketPreview renders as a normal sibling
 * below it, picking up the parent page's flex gap like every other homepage section.
 *
 * GlassHeadlineHero injects its own <style> tag (word-scoped CSS for the glass effect, not
 * expressible as Tailwind classes). middleware.ts's strict nonce-based CSP
 * (style-src 'self' 'nonce-...', no unsafe-inline) blocks any <style>/<script> without a
 * matching nonce, so it's read here from the request header middleware forwards and passed
 * down - the same per-request nonce Next already bakes into its own hydration scripts.
 */
export async function Hero() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <GlassHeadlineHero
        eyebrow="Esports betting"
        title="Bet on the game. Back the moment."
        description="A spectator-driven betting platform where matched bets compete against each other, at fixed 1.8x odds. Every amount here is simulated."
        primaryAction={{ label: "Explore the Arena", href: "/games" }}
        secondaryAction={{ label: "How it works", href: "/how-it-works" }}
        height="min(100svh,56rem)"
        nonce={nonce}
      />
      <HeroMarketPreview />
    </>
  );
}
