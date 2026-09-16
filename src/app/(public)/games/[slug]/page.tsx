import { notFound } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { resolveThemeKey } from "@/ui/tokens/theme";

/** Catalog is small enough that one page covers it all — see the games listing page for the same cap. */
const GAMES_PAGE_LIMIT = 50;

interface PageProps {
  readonly params: Promise<{ slug: string }>;
}

export default async function GameLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const container = getContainer();
  const games = await container.listGames.execute({ limit: GAMES_PAGE_LIMIT });
  const game = games.items.find((item) => item.slug === slug);

  if (!game) {
    notFound();
  }

  const themeKey = resolveThemeKey(game.slug);

  return (
    <div data-theme={themeKey} className="flex flex-col gap-4 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">{game.name}</h1>
      <p className="text-[var(--text-secondary)]">
        Browse matches and markets for {game.name} on the Matches and Markets pages.
      </p>
    </div>
  );
}
