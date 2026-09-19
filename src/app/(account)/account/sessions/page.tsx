import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { SessionsPanel } from "@/ui/account/SessionsPanel";

export const metadata = {
  title: "Sessions — P2P Arena",
};

export default async function AccountSessionsPage() {
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }

  const session = await container.sessionService.validateSession(token);
  const sessions = await container.listSessions.execute({ userId: session.userId });

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Sessions</h1>
      <SessionsPanel
        currentSessionId={session.id}
        initialSessions={sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          userAgent: s.userAgent,
        }))}
      />
    </div>
  );
}
