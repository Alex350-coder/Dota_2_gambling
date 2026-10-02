import { GlassHeadlineHero } from "./GlassHeadlineHero";
import { HeroMarketPreview } from "./HeroMarketPreview";

/**
 * Public homepage hero content (T-717 follow-up). The WebGL2 glass background is a separate,
 * page-wide fixed layer (PageGlassBackground, mounted once in PublicLayout) that paints onto
 * this component's <h1> - this is just the content, rendered in normal flow.
 */
export function Hero() {
  return (
    <>
      <GlassHeadlineHero
        eyebrow="Esports betting"
        title="Bet on the game. Back the moment."
        description="A spectator-driven betting platform where matched bets compete against each other, at fixed 1.8x odds. Every amount here is simulated."
        primaryAction={{ label: "Explore the Arena", href: "/games" }}
        secondaryAction={{ label: "How it works", href: "/how-it-works" }}
      />
      <HeroMarketPreview />
    </>
  );
}
