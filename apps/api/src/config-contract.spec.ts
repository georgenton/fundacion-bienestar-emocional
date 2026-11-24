import { describe, expect, it } from "vitest";
import { loadConfig } from "@fbe/config";

const validEnvironment = {
  APP_ENV: "test",
  APP_NAME: "FBE Test",
  API_PORT: "3001",
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "a-secure-test-secret-with-more-than-32-characters",
  BETTER_AUTH_URL: "http://localhost:3001",
  AUTH_RESET_TOKEN_TTL_SECONDS: "900",
  ALLOW_SYNTHETIC_SEED: "false",
  SYNTHETIC_DATA_ONLY: "true",
  LOG_LEVEL: "info",
} as NodeJS.ProcessEnv;

describe("configuration contract", () => {
  it("accepts a complete isolated test configuration", () => {
    expect(loadConfig(validEnvironment).appEnv).toBe("test");
  });

  it("rejects placeholder secrets", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, BETTER_AUTH_SECRET: "replace-with-32-or-more-random-characters" }),
    ).toThrow();
  });

  it("never permits synthetic seed execution in production", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, APP_ENV: "production", ALLOW_SYNTHETIC_SEED: "true" }),
    ).toThrow();
  });
});
