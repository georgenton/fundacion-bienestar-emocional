import { z } from "zod";

const environmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    APP_NAME: z.string().min(1),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    WEB_ORIGIN: z.url(),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    AUTH_RESET_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    ALLOW_SYNTHETIC_INVITATIONS: z.enum(["true", "false"]).default("false"),
    ALLOW_SYNTHETIC_SEED: z.enum(["true", "false"]).default("false"),
    SYNTHETIC_DATA_ONLY: z.literal("true"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((value, context) => {
    if (value.BETTER_AUTH_SECRET.startsWith("replace-with")) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "must be generated locally; run pnpm env:init",
      });
    }

    if (value.APP_ENV === "production" && value.ALLOW_SYNTHETIC_SEED === "true") {
      context.addIssue({
        code: "custom",
        path: ["ALLOW_SYNTHETIC_SEED"],
        message: "cannot be enabled in production",
      });
    }
  });

export type AppConfig = Readonly<{
  appEnv: "development" | "test" | "production";
  appName: string;
  apiPort: number;
  webOrigin: string;
  databaseUrl: string;
  authSecret: string;
  authUrl: string;
  resetTokenTtlSeconds: number;
  allowSyntheticSeed: boolean;
  allowSyntheticInvitations: boolean;
  syntheticDataOnly: true;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
}>;

let cachedConfig: AppConfig | undefined;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  if (environment === process.env && cachedConfig) {
    return cachedConfig;
  }

  const parsed = environmentSchema.parse(environment);
  const config: AppConfig = Object.freeze({
    appEnv: parsed.APP_ENV,
    appName: parsed.APP_NAME,
    apiPort: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    databaseUrl: parsed.DATABASE_URL,
    authSecret: parsed.BETTER_AUTH_SECRET,
    authUrl: parsed.BETTER_AUTH_URL,
    resetTokenTtlSeconds: parsed.AUTH_RESET_TOKEN_TTL_SECONDS,
    allowSyntheticInvitations: parsed.ALLOW_SYNTHETIC_INVITATIONS === "true",
    allowSyntheticSeed: parsed.ALLOW_SYNTHETIC_SEED === "true",
    syntheticDataOnly: true,
    logLevel: parsed.LOG_LEVEL,
  });

  if (environment === process.env) {
    cachedConfig = config;
  }
  return config;
}

export function resetConfigForTests(): void {
  cachedConfig = undefined;
}
