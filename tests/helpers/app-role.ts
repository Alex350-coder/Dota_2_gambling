import pg, { type Pool } from "pg";

/**
 * app_role is created NOLOGIN by 0005_app_role_grants.sql so no password is ever committed to
 * a migration file. Tests (and real deploys) grant it LOGIN + a password out-of-band, sourced
 * from the environment. ALTER ROLE ... PASSWORD doesn't accept a driver-bound placeholder ($1),
 * so the value is escaped with pg's own literal-escaping utility rather than concatenated raw.
 */
export async function grantAppRoleLogin(pool: Pool, password: string): Promise<void> {
  await pool.query(`ALTER ROLE app_role WITH LOGIN PASSWORD ${pg.escapeLiteral(password)}`);
}
