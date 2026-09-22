import Link from "next/link";
import { getContainer } from "@/platform/http/container";

interface UsersPageProps {
  readonly searchParams: Promise<{ page?: string }>;
}

/** T-903 — server-fetched via ListUsersUseCase directly, same convention as every other
 * admin/account page in this project (no client-side data fetching). */
export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const { page } = await searchParams;
  const container = getContainer();
  const result = await container.listUsers.execute({ page: page ? Number(page) : undefined });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Users</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
            <th className="py-2">Email</th>
            <th className="py-2">Status</th>
            <th className="py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((user) => (
            <tr key={user.id} className="border-b border-[var(--border-default)]">
              <td className="py-2">
                <Link
                  href={`/admin/users/${user.id}`}
                  className="text-[var(--text-primary)] underline"
                >
                  {user.email}
                </Link>
              </td>
              <td className="py-2 text-[var(--text-primary)]">{user.status}</td>
              <td className="py-2 text-[var(--text-secondary)]">{user.createdAt.toISOString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-[var(--text-secondary)]">
        Page {result.page} of {Math.max(1, Math.ceil(result.total / result.limit))} · {result.total}{" "}
        total
      </p>
    </section>
  );
}
