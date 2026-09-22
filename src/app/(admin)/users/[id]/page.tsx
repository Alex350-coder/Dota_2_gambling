import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { DomainError } from "@/domain/errors";
import { UserStatusActions } from "@/ui/admin/UserStatusActions";

interface UserDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

/**
 * Reading a user's detail here is itself audited (GetUserUseCase, OBSERVABILITY.md §1) with the
 * viewing admin's own session as the actor — the (admin) layout already confirmed ADMIN/AUDITOR,
 * this page resolves the session again (same double-check every account/admin page in this
 * project performs, e.g. `(account)/account/wallet/page.tsx`) purely to get the real actorId.
 */
export default async function AdminUserDetailPage({ params }: UserDetailPageProps) {
  const { id } = await params;
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }
  const session = await container.sessionService.validateSession(token);

  let user;
  try {
    user = await container.getUser.execute({ actorId: session.userId, userId: id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESOURCE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{user.email}</h1>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Date of birth</dt>
          <dd className="text-[var(--text-primary)]">{user.dateOfBirth}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Email verified</dt>
          <dd className="text-[var(--text-primary)]">
            {user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : "no"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">MFA</dt>
          <dd className="text-[var(--text-primary)]">
            {user.mfaEnabledAt ? "enabled" : "disabled"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Created</dt>
          <dd className="text-[var(--text-primary)]">{user.createdAt.toISOString()}</dd>
        </div>
      </dl>
      <UserStatusActions userId={user.id} status={user.status} />
    </section>
  );
}
