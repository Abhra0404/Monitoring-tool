import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("returns defaults when no env vars set", () => {
    const cfg = loadConfig();
    expect(cfg.PORT).toBe(5000);
    expect(cfg.HOST).toBe("0.0.0.0");
    expect(cfg.NODE_ENV).toBe("test");
    expect(cfg.DATABASE_URL).toBeUndefined();
  });
});
