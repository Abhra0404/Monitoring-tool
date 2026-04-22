import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, resetConfigForTest, isDbMode, isRedisMode } from "./config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    resetConfigForTest();
  });

  it("returns defaults when no env vars set", () => {
    const cfg = loadConfig();
    expect(cfg.PORT).toBe(5000);
    expect(cfg.HOST).toBe("0.0.0.0");
    expect(cfg.NODE_ENV).toBe("test");
    expect(cfg.DATABASE_URL).toBeUndefined();
    expect(cfg.RATE_LIMIT_MAX).toBe(100);
    expect(cfg.CORS_ORIGINS).toBe("*");
  });

  it("isDbMode reflects DATABASE_URL presence", () => {
    expect(isDbMode()).toBe(false);
    process.env.DATABASE_URL = "postgres://x";
    resetConfigForTest();
    expect(isDbMode()).toBe(true);
    delete process.env.DATABASE_URL;
    resetConfigForTest();
  });

  it("isRedisMode reflects REDIS_URL presence", () => {
    expect(isRedisMode()).toBe(false);
    process.env.REDIS_URL = "redis://x";
    resetConfigForTest();
    expect(isRedisMode()).toBe(true);
    delete process.env.REDIS_URL;
    resetConfigForTest();
  });
});
