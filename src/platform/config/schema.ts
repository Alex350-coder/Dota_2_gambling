import { z } from "zod";

const booleanFromString = z.enum(["true", "false"]).transform((value) => value === "true");

/**
 * RULE-K01 (Claude/Rules.md): MONEY_MODE must default to SIMULATED. REAL is
 * rejected here unconditionally until the Production Readiness Gate (T-1009,
 * Claude/compliance/COMPLIANCE.md §4) is implemented and wired into this schema.
 */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),

  MONEY_MODE: z.enum(["SIMULATED", "REAL"]).default("SIMULATED"),
  CURRENCY: z.string().length(3).default("PEN"),

  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DATABASE_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

  SESSION_COOKIE_NAME: z.string().min(1).default("sid"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  SESSION_STEPUP_MAX_AGE_MINUTES: z.coerce.number().int().positive().default(15),
  ENCRYPTION_KEY: z.string().min(32),

  RATE_LIMIT_ENABLED: booleanFromString.default(true),

  RG_DEFAULT_DAILY_STAKE_LIMIT_MINOR: z.coerce.number().int().nonnegative(),
  RG_LIMIT_INCREASE_COOLING_OFF_HOURS: z.coerce.number().int().nonnegative(),
  SIMULATED_CREDIT_DAILY_CAP_MINOR: z.coerce.number().int().nonnegative(),

  // RULE-K02: only the simulated provider may be registered while MONEY_MODE=SIMULATED.
  PAYMENT_PROVIDER: z.literal("simulated").default("simulated"),

  METRICS_ENABLED: booleanFromString.default(true),
  METRICS_TOKEN: z.string().min(1),
});

function rejectRealMoneyMode(): { message: string; path: string[] } {
  return {
    message:
      "MONEY_MODE=REAL is rejected: the Production Readiness Gate (T-1009) is not implemented yet",
    path: ["MONEY_MODE"],
  };
}

export const envSchema = baseEnvSchema.refine(
  (config) => config.MONEY_MODE === "SIMULATED",
  rejectRealMoneyMode(),
);

export type Config = z.infer<typeof envSchema>;

/**
 * Narrower schema for DB/ops CLI scripts (db:migrate, db:check-drift, db:seed,
 * db:audit-grants, reconcile) that only ever touch the database pool and the
 * money-mode gate — not the full application boot config (APP_URL, ENCRYPTION_KEY,
 * session/RG/metrics settings). CI's `database`/`integration`/`reconcile` jobs only
 * export DATABASE_URL and MONEY_MODE, so requiring the full schema there fails
 * these scripts on unrelated missing env vars.
 */
export const toolingEnvSchema = baseEnvSchema
  .pick({
    MONEY_MODE: true,
    DATABASE_URL: true,
    DATABASE_POOL_MAX: true,
    DATABASE_STATEMENT_TIMEOUT_MS: true,
    DATABASE_LOCK_TIMEOUT_MS: true,
  })
  .refine((config) => config.MONEY_MODE === "SIMULATED", rejectRealMoneyMode());

export type ToolingConfig = z.infer<typeof toolingEnvSchema>;
