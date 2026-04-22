import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import {
  buildRoot, saveInstances, newInstanceId, redactConfig, discoverPlugins,
  loadInstances, defaultPluginsDir, type PluginsRoot,
} from "./registry.js";
import { validateManifest } from "./manifest.js";
import { runCheckInSandbox } from "./sandbox.js";
import { scheduleOne, unscheduleOne, startScheduler } from "./scheduler.js";

const execFileAsync = promisify(execFile);

/** Module-scoped singleton so tests and the scheduler share one view. */
let ROOT: PluginsRoot | null = null;

export function getPluginsRoot(rootDir?: string): PluginsRoot {
  if (!ROOT) ROOT = buildRoot(rootDir ?? defaultPluginsDir());
  return ROOT;
}

/** For tests — lets integration tests point the registry at a tmp dir. */
export function _setPluginsRoot(root: PluginsRoot): void { ROOT = root; }

const pluginsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);

  // GET /api/plugins  — installed + available plugins + instances
  app.get("/", async (_req) => {
    const root = getPluginsRoot();
    // Refresh discovery so newly installed npm packages show up.
    root.plugins = discoverPlugins(root.rootDir);
    return {
      rootDir: root.rootDir,
      installed: root.plugins.map((p) => ({
        name: p.manifest.name,
        displayName: p.manifest.displayName ?? p.manifest.name,
        version: p.manifest.version,
        type: p.manifest.type,
        description: p.manifest.description,
        icon: p.manifest.icon,
        intervalSeconds: p.manifest.intervalSeconds,
        metrics: p.manifest.metrics ?? [],
        configSchema: p.manifest.configSchema ?? null,
      })),
      instances: root.instances.map((i) => {
        const manifest = root.plugins.find((p) => p.manifest.name === i.name)?.manifest;
        return {
          id: i.id,
          name: i.name,
          displayName: manifest?.displayName ?? i.name,
          enabled: i.enabled,
          config: redactConfig(manifest, i.config),
          lastRunAt: i.lastRunAt,
          lastStatus: i.lastStatus,
          lastLatencyMs: i.lastLatencyMs,
          lastDetail: i.lastDetail,
          lastError: i.lastError,
        };
      }),
    };
  });

  // POST /api/plugins/install  — npm-install a package into ~/.theoria/plugins
  app.post<{ Body: { package: string } }>("/install", {
    schema: {
      body: {
        type: "object",
        required: ["package"],
        properties: {
          package: { type: "string", pattern: "^[@a-z0-9][a-z0-9._/@-]*$", maxLength: 200 },
        },
      },
    },
  }, async (req, reply) => {
    const root = getPluginsRoot();
    const pkg = req.body.package;
    try {
      await execFileAsync("npm", ["install", pkg, "--no-audit", "--no-fund", "--silent"], {
        cwd: root.rootDir,
        timeout: 120_000,
        env: { ...process.env, NPM_CONFIG_FUND: "false", NPM_CONFIG_UPDATE_NOTIFIER: "false" },
      });
    } catch (err) {
      const e = err as Error;
      return reply.code(502).send({ error: "npm install failed", detail: e.message });
    }
    root.plugins = discoverPlugins(root.rootDir);
    const name = pkg.replace(/@[^/]+$/, ""); // strip trailing @version
    const installed = root.plugins.find((p) => p.manifest.name === name || pkg.startsWith(p.manifest.name));
    if (!installed) {
      return reply.code(400).send({
        error: "package installed but no theoria-plugin.json found or manifest invalid",
      });
    }
    return reply.code(201).send({
      name: installed.manifest.name,
      version: installed.manifest.version,
      type: installed.manifest.type,
    });
  });

  // DELETE /api/plugins/:name  — npm-remove + drop instances
  app.delete<{ Params: { name: string } }>("/:name", async (req, reply) => {
    const root = getPluginsRoot();
    const name = req.params.name;
    const remaining = root.instances.filter((i) => i.name !== name);
    for (const removed of root.instances.filter((i) => i.name === name)) {
      unscheduleOne(removed.id);
    }
    root.instances = remaining;
    saveInstances(root.rootDir, remaining);
    try {
      await execFileAsync("npm", ["uninstall", name, "--silent"], { cwd: root.rootDir, timeout: 60_000 });
    } catch {
      // ignore — best-effort
    }
    root.plugins = discoverPlugins(root.rootDir);
    return reply.code(204).send();
  });

  // POST /api/plugins/instances  — create an instance of an installed plugin
  app.post<{ Body: { name: string; config?: Record<string, unknown>; enabled?: boolean } }>("/instances", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1 },
          config: { type: "object", additionalProperties: true },
          enabled: { type: "boolean" },
        },
      },
    },
  }, async (req, reply) => {
    const root = getPluginsRoot();
    const plugin = root.plugins.find((p) => p.manifest.name === req.body.name);
    if (!plugin) return reply.code(404).send({ error: "plugin not installed" });
    const inst = {
      id: newInstanceId(),
      name: plugin.manifest.name,
      enabled: req.body.enabled !== false,
      config: req.body.config ?? {},
      createdAt: new Date().toISOString(),
    };
    root.instances.push(inst);
    saveInstances(root.rootDir, root.instances);
    if (inst.enabled && plugin.manifest.type === "server-check" && app.store.systemUser) {
      scheduleOne(app, root, app.store.systemUser._id, plugin, inst);
    }
    return reply.code(201).send(inst);
  });

  // PUT /api/plugins/instances/:id  — update config / enabled
  app.put<{ Params: { id: string }; Body: { config?: Record<string, unknown>; enabled?: boolean } }>(
    "/instances/:id",
    async (req, reply) => {
      const root = getPluginsRoot();
      const inst = root.instances.find((i) => i.id === req.params.id);
      if (!inst) return reply.code(404).send({ error: "instance not found" });
      if (typeof req.body.enabled === "boolean") inst.enabled = req.body.enabled;
      if (req.body.config) inst.config = { ...inst.config, ...req.body.config };
      saveInstances(root.rootDir, root.instances);
      unscheduleOne(inst.id);
      if (inst.enabled && app.store.systemUser) {
        const plugin = root.plugins.find((p) => p.manifest.name === inst.name);
        if (plugin && plugin.manifest.type === "server-check") {
          scheduleOne(app, root, app.store.systemUser._id, plugin, inst);
        }
      }
      return inst;
    },
  );

  // DELETE /api/plugins/instances/:id
  app.delete<{ Params: { id: string } }>("/instances/:id", async (req, reply) => {
    const root = getPluginsRoot();
    const idx = root.instances.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return reply.code(404).send({ error: "instance not found" });
    unscheduleOne(req.params.id);
    root.instances.splice(idx, 1);
    saveInstances(root.rootDir, root.instances);
    return reply.code(204).send();
  });

  // POST /api/plugins/instances/:id/run  — fire a one-off check now (returns output)
  app.post<{ Params: { id: string } }>("/instances/:id/run", async (req, reply) => {
    const root = getPluginsRoot();
    const inst = root.instances.find((i) => i.id === req.params.id);
    if (!inst) return reply.code(404).send({ error: "instance not found" });
    const plugin = root.plugins.find((p) => p.manifest.name === inst.name);
    if (!plugin) return reply.code(400).send({ error: "plugin package missing" });
    const res = await runCheckInSandbox({
      pluginDir: plugin.pluginDir,
      entry: plugin.manifest.entry,
      config: inst.config,
      timeoutMs: plugin.manifest.timeoutMs ?? 10_000,
    });
    return res;
  });
};

export default pluginsRoutes;

/**
 * Boot-time hook: discover plugins, load their persisted instances, and
 * start the scheduler for all enabled server-check plugins.
 */
export function initPluginsOnBoot(app: FastifyInstance): void {
  const rootDir = process.env.THEORIA_PLUGINS_DIR || defaultPluginsDir();
  const plugins = discoverPlugins(rootDir);
  const instances = loadInstances(rootDir);
  ROOT = { rootDir, plugins, instances };
  if (!app.store.systemUser) return;
  startScheduler(app, ROOT, app.store.systemUser._id);
}

/** Exported for tests. */
export const _internals = {
  buildRoot, newInstanceId, validateManifest, path, fs,
};
