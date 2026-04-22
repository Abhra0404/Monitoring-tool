import { describe, it, expect } from "vitest";
import { validateManifest, ManifestValidationError } from "./manifest.js";

const VALID = {
  name: "theoria-plugin-redis",
  version: "1.0.0",
  type: "server-check",
  entry: "index.js",
  intervalSeconds: 30,
  timeoutMs: 5000,
};

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    const out = validateManifest(VALID);
    expect(out.name).toBe("theoria-plugin-redis");
    expect(out.type).toBe("server-check");
    expect(out.intervalSeconds).toBe(30);
  });

  it("applies default intervalSeconds and timeoutMs", () => {
    const { intervalSeconds, ...rest } = VALID;
    void intervalSeconds;
    const out = validateManifest({ ...rest, timeoutMs: undefined });
    expect(out.intervalSeconds).toBe(60);
    expect(out.timeoutMs).toBe(10_000);
  });

  it("rejects an invalid name", () => {
    expect(() => validateManifest({ ...VALID, name: "Bad Name!" })).toThrow(ManifestValidationError);
    expect(() => validateManifest({ ...VALID, name: "-leading-dash" })).toThrow(ManifestValidationError);
    expect(() => validateManifest({ ...VALID, name: "" })).toThrow(ManifestValidationError);
  });

  it("rejects non-semver version", () => {
    expect(() => validateManifest({ ...VALID, version: "not-semver" })).toThrow(ManifestValidationError);
    expect(() => validateManifest({ ...VALID, version: "1.0" })).toThrow(ManifestValidationError);
  });

  it("rejects unknown plugin types", () => {
    expect(() => validateManifest({ ...VALID, type: "something-else" })).toThrow(ManifestValidationError);
  });

  it("rejects unsafe entry paths", () => {
    expect(() => validateManifest({ ...VALID, entry: "../etc/passwd" })).toThrow(ManifestValidationError);
    expect(() => validateManifest({ ...VALID, entry: "/abs/path.js" })).toThrow(ManifestValidationError);
    expect(() => validateManifest({ ...VALID, entry: "" })).toThrow(ManifestValidationError);
  });

  it("caps over-large intervals and timeouts", () => {
    const out = validateManifest({ ...VALID, intervalSeconds: 999999, timeoutMs: 999999 });
    expect(out.intervalSeconds).toBeLessThanOrEqual(86_400);
    expect(out.timeoutMs).toBeLessThanOrEqual(60_000);
  });

  it("preserves metrics and configSchema when provided", () => {
    const schema = { type: "object", properties: { host: { type: "string" } } };
    const out = validateManifest({
      ...VALID,
      metrics: [{ name: "x", unit: "s" }],
      configSchema: schema,
    });
    expect(out.metrics).toHaveLength(1);
    expect(out.configSchema).toEqual(schema);
  });
});
