/**
 * Environment config with zod validation.
 * Provides typed access to all server configuration. Any config change
 * goes through this module — never read `process.env` directly elsewhere.
 */

import { z } from "zod";

const envSchema = z.object({
  // Networking
  PORT: z.coerce.number().default(5000),
  HOST: z.string().default("0.0.0.0"),

  // Storage
  DATABASE_URL: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Cache / pub-sub (Phase 6 — optional)
  REDIS_URL: z.string().optional(),

  // Authentication secrets
  //
  // In development we use a stable default so contributors don't need
  // to set env vars. In production we *refuse* to fall back to it —
  // a leaked default secret is equivalent to no auth at all.
  JWT_SECRET: z.string().min(16).default("theoria-dev-secret-change-me-please"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  /**
   * Controls whether new users may self-register via POST /api/auth/register.
   * When false, registration is only permitted during bootstrap (no non-system
   * users exist yet) — the first caller becomes admin.
   */
  ALLOW_REGISTRATION: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),

  /**
   * Bootstrap admin credentials. When set, the server guarantees an admin
   * account with this email/password exists on startup.
   */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  // Client assets
  CLIENT_BUILD_PATH: z.string().optional(),

  // Runtime
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .optional(),

  // CORS (comma-separated origin list; "*" in dev only)
  CORS_ORIGINS: z.string().default("*"),

  // Rate limiting (per-IP default window)
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),

  // Telemetry (Phase 6)
  SENTRY_DSN: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

const DEV_JWT_SECRET = "theoria-dev-secret-change-me-please";

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment config:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid server environment configuration");
  }
  // Refuse to boot in production with the bundled dev secret. A leaked
  // default JWT secret is equivalent to no authentication.
  if (parsed.data.NODE_ENV === "production" && parsed.data.JWT_SECRET === DEV_JWT_SECRET) {
    throw new Error(
      "JWT_SECRET must be set to a strong, unique value in production. Refusing to boot with the development default.",
    );
  }
  _config = parsed.data;
  return _config;
}

export function getConfig(): Config {
  return _config ?? loadConfig();
}

export function resetConfigForTest(): void {
  _config = null;
}

export function isDbMode(): boolean {
  return !!getConfig().DATABASE_URL;
}

export function isRedisMode(): boolean {
  return !!getConfig().REDIS_URL;
}

export function isProd(): boolean {
  return getConfig().NODE_ENV === "production";
}
