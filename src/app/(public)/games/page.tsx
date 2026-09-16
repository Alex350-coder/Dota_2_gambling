import Link from "next/link";
import { getContainer } from "@/platform/http/container";
import { EmptyState } from "@/ui/layout/EmptyState";

export const metadata = {
  title: "Games — P2P Arena",
};

/** Matches the catalog's own list-endpoint page-size cap (`MAX_PAGE_SIZE` in `src/application/catalog/pagination.ts`) — the game catalog is small enough that one page covers it all. */
const GAMES_PAGE_LIMIT = 50;

export default async function GamesPage() {
  const container = getContainer();
  const games = await container.listGames.execute({ limit: GAMES_PAGE_LIMIT });

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Games</h1>
      {games.items.length === 0 ? (
        <EmptyState message="No games available yet." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {games.items.map((game) => (
            <li key={game.id}>
              <Link
                href={`/games/${game.slug}`}
                className="block rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3 hover:border-[var(--border-strong)]"
              >
                {game.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
