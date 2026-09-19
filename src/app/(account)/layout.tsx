import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { DisclaimerBanner } from "@/ui/layout/DisclaimerBanner";
import { NavBar } from "@/ui/layout/NavBar";
import { Footer } from "@/ui/layout/Footer";
import { AccountNav } from "@/ui/account/AccountNav";
import { SessionTimeReminder } from "@/ui/compliance/SessionTimeReminder";

export const dynamic = "force-dynamic";

/** Soft reminder cadence (T-813) — independent of the hard `SESSION_TIME` RG limit. */
const SESSION_REMINDER_INTERVAL_MINUTES = 60;

/**
 * Every /account/** page needs a valid session — resolved once here via the same
 * `SessionService.validateSession` the API routes use, so an expired/revoked cookie is
 * rejected identically whether the caller hits the UI or the API (no separate UI-only trust
 * path). There is no dedicated login page in this project yet (auth is API-only through P7),
 * so an unauthenticated visitor is sent to the public home page rather than a nonexistent
 * `/login` route.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { config, sessionService } = getContainer();
  const store = await cookies();
  const token = store.get(config.SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/");
  }

  let sessionCreatedAt: Date;
  try {
    const session = await sessionService.validateSession(token);
    sessionCreatedAt = session.createdAt;
  } catch {
    redirect("/");
  }

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
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8"
      >
        <AccountNav />
        <SessionTimeReminder
          sessionStartedAt={sessionCreatedAt.toISOString()}
          intervalMinutes={SESSION_REMINDER_INTERVAL_MINUTES}
        />
        {children}
      </main>
      <Footer />
    </div>
  );
}
