import { z } from "zod";
import { envSchema, toolingEnvSchema, type Config, type ToolingConfig } from "./schema";

export type { Config, ToolingConfig } from "./schema";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/**
 * Pure parse function: validates a raw environment record against the schema.
 * Throws ConfigError with every issue listed, never partially-valid config.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Invalid environment configuration:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

let cachedConfig: Config | undefined;

/**
 * Boot-time entry point (Validation.md: "Env/config" boundary — process refuses
 * to boot on invalid or missing config). Exits the process with a non-zero code
 * and a human-readable message instead of letting the app start half-configured.
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }
  try {
    cachedConfig = parseConfig(process.env);
    return cachedConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line project/no-console -- boot-failure diagnostics before logger/config exist
    console.error(`[config] ${message}`);
    process.exit(1);
  }
}

let cachedToolingConfig: ToolingConfig | undefined;

/**
 * Boot-time entry point for DB/ops CLI scripts (db:migrate, db:check-drift, db:seed,
 * db:audit-grants, reconcile) — validates only the database pool + MONEY_MODE fields,
 * not the full application config. See ToolingConfig in ./schema for why.
 */
export function loadToolingConfig(): ToolingConfig {
  if (cachedToolingConfig) {
    return cachedToolingConfig;
  }
  const result = toolingEnvSchema.safeParse(process.env);
  if (!result.success) {
    const message = `Invalid environment configuration:\n${formatIssues(result.error)}`;
    // eslint-disable-next-line project/no-console -- boot-failure diagnostics before logger/config exist
    console.error(`[config] ${message}`);
    process.exit(1);
  }
  cachedToolingConfig = result.data;
  return cachedToolingConfig;
}
