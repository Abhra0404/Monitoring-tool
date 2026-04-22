/**
 * Worker-thread sandbox entry. Runs ONE plugin at a time.
 *
 * Shipped as plain CommonJS so it can be loaded by `new Worker(path)`
 * without any extra loader — both in production (tsc emits it as-is via
 * copy) and in vitest/tsx (runs directly from source).
 *
 * Parent protocol:
 *   → { kind: "run", config }              Invoke the plugin's `check` export.
 *   ← { kind: "result", data }             Normal return value.
 *   ← { kind: "error", message, stack? }   Thrown or rejected.
 */

"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { resolve, join } = require("node:path");

async function loadPlugin() {
  const { pluginDir, entry } = workerData;
  const resolvedEntry = resolve(join(pluginDir, entry));
  try {
    // Prefer CJS require for sync semantics when entry is .js/.cjs.
    const req = createRequire(join(pluginDir, "package.json"));
    return req(resolvedEntry);
  } catch {
    // Fall back to dynamic ESM import.
    return await import(pathToFileURL(resolvedEntry).href);
  }
}

if (!parentPort) {
  throw new Error("plugin worker must be spawned with a parentPort");
}

let pluginPromise = null;

parentPort.on("message", async (message) => {
  if (!message || message.kind !== "run") return;
  try {
    if (!pluginPromise) pluginPromise = loadPlugin();
    const mod = await pluginPromise;
    const check = (mod && mod.check) || (mod && mod.default && mod.default.check);
    if (typeof check !== "function") {
      throw new Error("plugin does not export a `check(config)` function");
    }
    const data = await check(message.config || {});
    parentPort.postMessage({ kind: "result", data });
  } catch (err) {
    parentPort.postMessage({
      kind: "error",
      message: err && err.message ? String(err.message) : String(err),
      stack: err && err.stack ? String(err.stack) : undefined,
    });
  }
});
