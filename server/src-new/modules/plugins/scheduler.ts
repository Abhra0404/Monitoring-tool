/**
 * Scheduler: runs enabled server-check plugin instances at their intervals.
 *
 * Each enabled instance of a `server-check` plugin gets its own
 * setInterval timer. The timer is coarse — we only run one check at a
 * time per instance; overlapping runs are prevented with an in-flight
 * flag. Failed/timed-out checks still emit results (status="down") so
 * the UI and alert engine see a consistent stream.
 */

import type { FastifyInstance } from "fastify";
import {
  type InstalledPlugin, type PluginInstance, type PluginsRoot,
  saveInstances,
} from "./registry.js";
import { runCheckInSandbox } from "./sandbox.js";
import { emitEvent } from "../events/service.js";

const timers = new Map<string, NodeJS.Timeout>();
const running = new Set<string>();

interface CheckOutput {
  status?: "up" | "down";
  latencyMs?: number;
  detail?: Record<string, unknown>;
  metrics?: Record<string, number>;
}

export function startScheduler(app: FastifyInstance, root: PluginsRoot, userId: string): void {
  stopScheduler();
  for (const inst of root.instances) {
    if (!inst.enabled) continue;
    const plugin = root.plugins.find((p) => p.manifest.name === inst.name);
    if (!plugin) continue;
    if (plugin.manifest.type !== "server-check") continue;
    scheduleOne(app, root, userId, plugin, inst);
  }
}

export function stopScheduler(): void {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();
}

export function scheduleOne(
  app: FastifyInstance,
  root: PluginsRoot,
  userId: string,
  plugin: InstalledPlugin,
  inst: PluginInstance,
): void {
  const existing = timers.get(inst.id);
  if (existing) clearInterval(existing);
  const intervalMs = Math.max(5_000, (plugin.manifest.intervalSeconds ?? 60) * 1000);

  // Kick off one immediate run, then schedule.
  void runOne(app, root, userId, plugin, inst);
  const t = setInterval(() => { void runOne(app, root, userId, plugin, inst); }, intervalMs);
  t.unref();
  timers.set(inst.id, t);
}

export function unscheduleOne(instanceId: string): void {
  const t = timers.get(instanceId);
  if (t) clearInterval(t);
  timers.delete(instanceId);
}

async function runOne(
  app: FastifyInstance,
  root: PluginsRoot,
  userId: string,
  plugin: InstalledPlugin,
  inst: PluginInstance,
): Promise<void> {
  if (running.has(inst.id)) return; // previous run still going
  running.add(inst.id);
  try {
    const res = await runCheckInSandbox({
      pluginDir: plugin.pluginDir,
      entry: plugin.manifest.entry,
      config: inst.config,
      timeoutMs: plugin.manifest.timeoutMs ?? 10_000,
    });

    const output: CheckOutput = res.ok && res.data && typeof res.data === "object"
      ? (res.data as CheckOutput)
      : {};
    const status: "up" | "down" = res.ok
      ? (output.status === "down" ? "down" : "up")
      : "down";
    const latencyMs = typeof output.latencyMs === "number" ? output.latencyMs : res.durationMs;

    // Update in-memory state + persist.
    inst.lastRunAt = new Date().toISOString();
    inst.lastStatus = status;
    inst.lastLatencyMs = latencyMs;
    inst.lastDetail = output.detail ?? {};
    inst.lastError = res.ok ? undefined : res.error;
    saveInstances(root.rootDir, root.instances);

    // Broadcast + record a timeline event on transition.
    const prevStatus = (inst as unknown as { _prev?: "up" | "down" })._prev;
    (inst as unknown as { _prev?: "up" | "down" })._prev = status;

    app.io?.to("all").emit("plugin:result", {
      instanceId: inst.id,
      name: inst.name,
      displayName: plugin.manifest.displayName ?? inst.name,
      status,
      latencyMs,
      detail: output.detail ?? {},
      error: inst.lastError,
      timestamp: Date.now(),
    });

    if (prevStatus && prevStatus !== status) {
      emitEvent(app.store, app.io, {
        userId,
        kind: "http_check", // best-fit existing event kind for an external probe
        source: `plugin:${inst.name}`,
        severity: status === "down" ? "error" : "info",
        title: `${plugin.manifest.displayName ?? inst.name} is ${status}`,
        detail: { instanceId: inst.id, ...output.detail, latencyMs, error: inst.lastError },
      });
    }
  } finally {
    running.delete(inst.id);
  }
}
