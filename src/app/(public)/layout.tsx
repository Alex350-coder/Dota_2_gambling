import { getContainer } from "@/platform/http/container";
import { DisclaimerBanner } from "@/ui/layout/DisclaimerBanner";
import { NavBar } from "@/ui/layout/NavBar";
import { Footer } from "@/ui/layout/Footer";

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
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { config } = getContainer();

  return (
    <div data-theme="default" className="flex min-h-screen flex-col">
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
