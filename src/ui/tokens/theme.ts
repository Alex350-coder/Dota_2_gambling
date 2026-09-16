/** Every value the `[data-theme]` selectors in `theme.css` implement — the single source of truth for which themes exist. */
export const THEME_KEYS = ["default", "dota", "cs2", "valorant", "lol"] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

const DEFAULT_THEME: ThemeKey = "default";

function isThemeKey(value: string): value is ThemeKey {
  return (THEME_KEYS as readonly string[]).includes(value);
}

/**
 * The `Game` catalog entity (`src/domain/ports/game-repository.ts`) has no dedicated
 * `themeKey` column — adding one is a domain/infra migration outside this phase's declared
 * file scope (`src/ui/**`, `src/app/(public)/**`). `Game.slug` already doubles as a stable,
 * admin-chosen identifier, so it is reused as the theme key here; any slug that doesn't match
 * a shipped theme falls back to `"default"` rather than rendering unstyled.
 */
export function resolveThemeKey(slug: string | null | undefined): ThemeKey {
  if (slug && isThemeKey(slug)) {
    return slug;
  }
  return DEFAULT_THEME;
}
