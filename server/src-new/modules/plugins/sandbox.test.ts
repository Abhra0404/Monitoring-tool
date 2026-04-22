import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheckInSandbox } from "./sandbox.js";

let tmp: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "theoria-sandbox-"));
  // A "package" with three fake plugins.
  fs.mkdirSync(path.join(tmp, "ok"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "ok", "package.json"), JSON.stringify({ name: "ok", version: "1.0.0" }));
  fs.writeFileSync(
    path.join(tmp, "ok", "index.js"),
    'exports.check = async (c) => ({ status: "up", latencyMs: 1, detail: { echo: c.x } });',
  );

  fs.mkdirSync(path.join(tmp, "throws"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "throws", "package.json"), JSON.stringify({ name: "throws", version: "1.0.0" }));
  fs.writeFileSync(
    path.join(tmp, "throws", "index.js"),
    'exports.check = async () => { throw new Error("boom"); };',
  );

  fs.mkdirSync(path.join(tmp, "hangs"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "hangs", "package.json"), JSON.stringify({ name: "hangs", version: "1.0.0" }));
  fs.writeFileSync(
    path.join(tmp, "hangs", "index.js"),
    // Returns a promise that never resolves — sandbox must kill it.
    "exports.check = () => new Promise(() => {});",
  );
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* swallow */ }
});

describe("plugin sandbox", () => {
  it("runs a well-behaved plugin and returns its data", async () => {
    const res = await runCheckInSandbox({
      pluginDir: path.join(tmp, "ok"),
      entry: "index.js",
      config: { x: 42 },
      timeoutMs: 3000,
    });
    expect(res.ok).toBe(true);
    expect((res.data as { status: string }).status).toBe("up");
    expect((res.data as { detail: { echo: number } }).detail.echo).toBe(42);
  });

  it("captures thrown errors from the plugin", async () => {
    const res = await runCheckInSandbox({
      pluginDir: path.join(tmp, "throws"),
      entry: "index.js",
      config: {},
      timeoutMs: 3000,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/boom/);
  });

  it("terminates plugins that exceed the timeout", async () => {
    const res = await runCheckInSandbox({
      pluginDir: path.join(tmp, "hangs"),
      entry: "index.js",
      config: {},
      timeoutMs: 500,
    });
    expect(res.ok).toBe(false);
    expect(res.timedOut).toBe(true);
    expect(res.durationMs).toBeGreaterThanOrEqual(400);
  });
});
