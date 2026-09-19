import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/platform/http/container";
import { ChangePasswordForm } from "@/ui/account/ChangePasswordForm";
import { MfaPanel } from "@/ui/account/MfaPanel";

export const metadata = {
  title: "Security — P2P Arena",
};

export default async function AccountSecurityPage() {
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
      <h1 className="text-3xl font-bold">Security</h1>
      <ChangePasswordForm />
      <MfaPanel initiallyEnabled={user.mfaEnabledAt !== null} />
    </div>
  );
}
