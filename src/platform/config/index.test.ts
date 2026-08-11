import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "./index";

const validEnv = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/betting_dev",
  ENCRYPTION_KEY: "a".repeat(48),
  RG_DEFAULT_DAILY_STAKE_LIMIT_MINOR: "100000",
  RG_LIMIT_INCREASE_COOLING_OFF_HOURS: "24",
  SIMULATED_CREDIT_DAILY_CAP_MINOR: "100000",
  METRICS_TOKEN: "local-token",
};

describe("parseConfig", () => {
  it("parses a valid environment and defaults MONEY_MODE to SIMULATED", () => {
    const config = parseConfig(validEnv);

    expect(config.MONEY_MODE).toBe("SIMULATED");
    expect(config.PAYMENT_PROVIDER).toBe("simulated");
    expect(config.CURRENCY).toBe("PEN");
    expect(config.RATE_LIMIT_ENABLED).toBe(true);
  });

  it("throws ConfigError when a required variable is missing", () => {
    const envWithoutToken = Object.fromEntries(
      Object.entries(validEnv).filter(([key]) => key !== "METRICS_TOKEN"),
    );

    expect(() => parseConfig(envWithoutToken)).toThrow(ConfigError);
  });

  it("throws ConfigError with every invalid field listed", () => {
    try {
      parseConfig({ ...validEnv, APP_URL: "not-a-url", DATABASE_URL: "not-a-url" });
      expect.fail("expected parseConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).toContain("APP_URL");
      expect(message).toContain("DATABASE_URL");
    }
  });

  it("rejects MONEY_MODE=REAL until the Production Readiness Gate is implemented", () => {
    expect(() => parseConfig({ ...validEnv, MONEY_MODE: "REAL" })).toThrow(ConfigError);
  });

  it("throws ConfigError when a numeric field is not a valid number", () => {
    expect(() =>
      parseConfig({ ...validEnv, RG_DEFAULT_DAILY_STAKE_LIMIT_MINOR: "not-a-number" }),
    ).toThrow(ConfigError);
  });
});
