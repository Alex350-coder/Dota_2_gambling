import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { authorize } from "@/platform/authz";
import { DisclaimerBanner } from "@/ui/layout/DisclaimerBanner";
import { NavBar } from "@/ui/layout/NavBar";
import { Footer } from "@/ui/layout/Footer";
import { AdminNav } from "@/ui/admin/AdminNav";

export const dynamic = "force-dynamic";

/**
 * Every /admin/** page requires an ACTIVE session belonging to a user holding the ADMIN or
 * AUDITOR role (T-901). This is the coarse shell-level gate — same `authorize()` primitive the
 * admin API routes already use (`src/app/api/v1/admin/markets/route.ts`), applied against the
 * `audit:read` action, which is the only policy entry granted to both roles (every admin action
 * at least implies reading admin-only data). Individual mutating routes/pages still call
 * `authorize()` again with their own narrower action (`market:manage`, `user:suspend`, ...) plus
 * `requireStepUp()` — this layout does not replace those per-action checks, it only keeps a
 * non-staff session from rendering any admin page at all. A rejected session is redirected to
 * the public home page rather than shown a 403, matching `(account)/layout.tsx`'s handling of a
 * missing/invalid session and avoiding disclosing that an admin route exists.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;

  try {
    await authorize(container, {
      token,
      action: "audit:read",
      resource: { ownerId: "system" },
    });
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
      {container.config.MONEY_MODE === "SIMULATED" && <DisclaimerBanner />}
      <NavBar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8"
      >
        <AdminNav />
        {children}
      </main>
      <Footer />
    </div>
  );
}
