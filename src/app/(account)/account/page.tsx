import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { UpdateEmailForm } from "@/ui/account/UpdateEmailForm";

export const metadata = {
  title: "Your Profile — P2P Arena",
};

export default async function AccountProfilePage() {
  const container = getContainer();
  const store = await cookies();
  const token = store.get(container.config.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/");
  }

  const session = await container.sessionService.validateSession(token);
  const user = await container.uow.run((tx) => container.users(tx).findById(session.userId));
  if (!user) {
    redirect("/");
  }

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Your Profile</h1>
      <dl className="grid grid-cols-1 gap-3 rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Account status</dt>
          <dd className="text-base">{user.status}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Email verified</dt>
          <dd className="text-base">{user.emailVerifiedAt ? "Yes" : "No — check your inbox"}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Member since</dt>
          <dd className="text-base">{user.createdAt.toISOString().slice(0, 10)}</dd>
        </div>
      </dl>
      <UpdateEmailForm currentEmail={user.email} />
    </div>
  );
}
