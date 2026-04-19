// ── Environment config with validation ──

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().default("theoria-dev-secret"),
  CLIENT_BUILD_PATH: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;
  _config = envSchema.parse(process.env);
  return _config;
}

export function getConfig(): Config {
  if (!_config) return loadConfig();
  return _config;
}

export function isDbMode(): boolean {
  return !!getConfig().DATABASE_URL;
}
