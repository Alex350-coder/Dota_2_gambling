export type UserRole = "USER" | "ADMIN" | "STREAMER" | "AUDITOR";

/** Every account implicitly has USER; explicit grants in user_roles add more. */
export interface UserRoleRepository {
  listRolesForUser(userId: string): Promise<readonly UserRole[]>;
}
