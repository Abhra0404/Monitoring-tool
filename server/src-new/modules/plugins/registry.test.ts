import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverPlugins, loadInstances, saveInstances, redactConfig, newInstanceId,
} from "./registry.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "theoria-registry-"));
  fs.mkdirSync(path.join(tmp, "node_modules"), { recursive: true });
});

function installPlugin(root: string, name: string, manifest: Record<string, unknown>, code = "exports.check = async () => ({ status: 'up' });"): string {
  const dir = path.join(root, "node_modules", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  fs.writeFileSync(path.join(dir, "theoria-plugin.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, "index.js"), code);
  return dir;
}

describe("plugin registry", () => {
  it("discovers well-formed plugins", () => {
    installPlugin(tmp, "theoria-plugin-alpha", {
      name: "theoria-plugin-alpha",
      version: "1.0.0",
      type: "server-check",
      entry: "index.js",
      intervalSeconds: 30,
      timeoutMs: 5000,
    });
    const found = discoverPlugins(tmp);
    expect(found).toHaveLength(1);
    expect(found[0].manifest.name).toBe("theoria-plugin-alpha");
  });

  it("discovers scoped npm packages (@scope/pkg)", () => {
    const scopedDir = path.join(tmp, "node_modules", "@theoria");
    fs.mkdirSync(scopedDir, { recursive: true });
    const name = "plugin-scoped";
    const dir = path.join(scopedDir, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `@theoria/${name}` }));
    fs.writeFileSync(path.join(dir, "theoria-plugin.json"), JSON.stringify({
      // NOTE: manifest.name must match dir basename — it's a safety check.
      name: "plugin-scoped",
      version: "1.0.0",
      type: "server-check",
      entry: "index.js",
      intervalSeconds: 60,
      timeoutMs: 5000,
    }));
    fs.writeFileSync(path.join(dir, "index.js"), "exports.check = async () => ({status:'up'});");

    const found = discoverPlugins(tmp);
    expect(found.map((f) => f.manifest.name)).toContain("plugin-scoped");
  });

  it("filters out packages with invalid manifests", () => {
    installPlugin(tmp, "bad-plugin", {
      name: "bad-plugin",
      version: "not-semver",
      type: "server-check",
      entry: "index.js",
    });
    const found = discoverPlugins(tmp);
    expect(found).toHaveLength(0);
  });

  it("filters out packages without a theoria-plugin.json", () => {
    const dir = path.join(tmp, "node_modules", "not-a-plugin");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "not-a-plugin" }));
    const found = discoverPlugins(tmp);
    expect(found).toHaveLength(0);
  });

  it("saves instances atomically with restricted permissions", () => {
    const instances = [{
      id: newInstanceId(),
      name: "theoria-plugin-demo",
      enabled: true,
      config: { host: "localhost" },
      createdAt: new Date().toISOString(),
    }];
    saveInstances(tmp, instances);
    const registryPath = path.join(tmp, "registry.json");
    expect(fs.existsSync(registryPath)).toBe(true);
    const stat = fs.statSync(registryPath);
    // Mode check (ignored on Windows but useful on Unix CI).
    if (process.platform !== "win32") {
      expect((stat.mode & 0o777) & ~0o600).toBe(0);
    }
    const reloaded = loadInstances(tmp);
    expect(reloaded).toEqual(instances);
  });

  it("redacts password-format fields", () => {
    const manifest = {
      name: "x", displayName: "X", version: "1.0.0", type: "server-check" as const,
      entry: "index.js", intervalSeconds: 30, timeoutMs: 5000,
      configSchema: {
        type: "object" as const,
        properties: {
          host: { type: "string" as const },
          password: { type: "string" as const, format: "password" as const },
        },
      },
    };
    const redacted = redactConfig(manifest, { host: "localhost", password: "secret" });
    expect(redacted.host).toBe("localhost");
    expect(redacted.password).not.toBe("secret");
    expect(redacted.password).toMatch(/•|x/); // masked somehow
  });
});
