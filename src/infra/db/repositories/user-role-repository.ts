import { eq } from "drizzle-orm";
import type { UserRole, UserRoleRepository } from "@/domain/ports";
import { userRoles } from "../schema/identity";
import type { DbTx } from "../uow";

export class DrizzleUserRoleRepository implements UserRoleRepository {
  constructor(private readonly tx: DbTx) {}

  async listRolesForUser(userId: string): Promise<readonly UserRole[]> {
    const rows = await this.tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return rows.map((row) => row.role);
  }
}
