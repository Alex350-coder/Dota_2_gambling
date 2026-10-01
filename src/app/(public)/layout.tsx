import { headers } from "next/headers";
import { getContainer } from "@/platform/http/container";
import { DisclaimerBanner } from "@/ui/layout/DisclaimerBanner";
import { NavBar } from "@/ui/layout/NavBar";
import { Footer } from "@/ui/layout/Footer";
import { PageGlassBackground } from "@/ui/home/PageGlassBackground";

/**
 * Every public page reads live config/data per request (bet markets, RG limits), so none of
 * them can be statically prerendered — this also keeps `loadConfig()` out of the build step,
 * which doesn't have the full runtime env (APP_URL, ENCRYPTION_KEY, etc.) available.
 */
export const dynamic = "force-dynamic";

/**
 * Shell for every public route (T-702). Applies the default theme at the root — pages that
 * render a specific `Game` re-apply `data-theme` on their own subtree via the same token
 * system (src/ui/tokens/theme.ts), never by changing layout here.
 *
 * PageGlassBackground (T-717 follow-up) is mounted once here, fixed behind everything below it,
 * so the animated glass background shows through on every public page, not just the homepage —
 * it reads headers().get("x-nonce") itself here (the same per-request nonce middleware.ts
 * forwards) because it needs the CSP nonce for its own injected <style> tag.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { config } = getContainer();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div data-theme="default" className="flex min-h-screen flex-col">
      <PageGlassBackground nonce={nonce} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--surface-2)] focus:px-4 focus:py-2 focus:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        Skip to main content
      </a>
      {config.MONEY_MODE === "SIMULATED" && <DisclaimerBanner />}
      <NavBar />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
