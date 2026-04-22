/**
 * Worker-backed sandbox executor for server-check plugins.
 *
 * Each call to `runCheckInSandbox` spawns a one-shot Worker with capped
 * memory + stack, runs the plugin's `check(config)` export under a hard
 * wall-clock timeout, and terminates the worker regardless of outcome.
 *
 * This is deliberately single-shot rather than a pooled long-lived worker:
 * it costs ~20–30ms of spawn overhead per invocation but gives us process
 * isolation for every run (a crash in one run can never corrupt the next).
 * For 60-second schedule intervals — which is the minimum we allow — that
 * overhead is well under 0.1% CPU.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plain CommonJS worker entry — sits next to this file in both the TS
// source tree and in `dist/` (copied by scripts/copy-migrations.mjs).
// Uses .cjs because the server package.json has `"type": "module"`.
const WORKER_ENTRY = join(__dirname, "worker-entry.cjs");

export interface SandboxResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  timedOut?: boolean;
}

export interface SandboxOptions {
  pluginDir: string;
  entry: string;
  config: Record<string, unknown>;
  timeoutMs: number;
  maxMemoryMb?: number;
}

export async function runCheckInSandbox(opts: SandboxOptions): Promise<SandboxResult> {
  const started = Date.now();
  const worker = new Worker(WORKER_ENTRY, {
    workerData: { pluginDir: opts.pluginDir, entry: opts.entry },
    resourceLimits: {
      maxOldGenerationSizeMb: opts.maxMemoryMb ?? 128,
      maxYoungGenerationSizeMb: 32,
      codeRangeSizeMb: 16,
      stackSizeMb: 4,
    },
    // Block filesystem / child_process escape routes via the experimental
    // permission model when supported. (No-op on older Nodes.)
    env: {},
  });

  return await new Promise<SandboxResult>((resolvePromise) => {
    let settled = false;
    const done = (r: SandboxResult) => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      clearTimeout(timer);
      resolvePromise(r);
    };

    const timer = setTimeout(() => {
      done({
        ok: false,
        error: `plugin check timed out after ${opts.timeoutMs}ms`,
        durationMs: Date.now() - started,
        timedOut: true,
      });
    }, opts.timeoutMs);

    worker.on("message", (msg: { kind: string; data?: unknown; message?: string }) => {
      if (msg.kind === "result") {
        done({ ok: true, data: msg.data, durationMs: Date.now() - started });
      } else if (msg.kind === "error") {
        done({ ok: false, error: msg.message ?? "plugin threw", durationMs: Date.now() - started });
      }
    });
    worker.on("error", (err) => {
      done({ ok: false, error: err.message, durationMs: Date.now() - started });
    });
    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        done({ ok: false, error: `worker exited with code ${code}`, durationMs: Date.now() - started });
      }
    });

    worker.postMessage({ kind: "run", config: opts.config });
  });
}
