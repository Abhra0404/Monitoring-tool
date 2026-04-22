/**
 * Plugin registry: discovery + instance state + persistence.
 *
 * Disk layout (everything under the user's Theoria config dir):
 *
 *   ~/.theoria/plugins/
 *     package.json                     # plain npm host so `npm install` works
 *     node_modules/
 *       theoria-plugin-redis/
 *         package.json
 *         theoria-plugin.json          # the manifest
 *         index.js                     # the entry
 *       theoria-plugin-postgres/...
 *     registry.json                    # per-instance enable/config state
 *
 * `registry.json` persists the user's choices: which installed plugins are
 * enabled, and what configuration values they should receive on each run.
 * It is owner-readable only (0600) because config values can include
 * secrets (db passwords, API tokens).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { validateManifest, type PluginManifest } from "./manifest.js";

export interface PluginInstance {
  id: string;                         // Stable UUID
  name: string;                       // npm package name
  enabled: boolean;
  config: Record<string, unknown>;    // user-supplied config
  createdAt: string;
  lastRunAt?: string;
  lastStatus?: "up" | "down" | "unknown";
  lastLatencyMs?: number;
  lastDetail?: Record<string, unknown>;
  lastError?: string;
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  pluginDir: string;                  // absolute path to node_modules/<name>
}

export interface PluginsRoot {
  plugins: InstalledPlugin[];
  instances: PluginInstance[];
  rootDir: string;
}

export function defaultPluginsDir(): string {
  return path.join(os.homedir(), ".theoria", "plugins");
}

function ensureHostDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  // Plain npm host so `npm install <pkg>` works inside this dir.
  const hostPkg = path.join(dir, "package.json");
  if (!fs.existsSync(hostPkg)) {
    fs.writeFileSync(
      hostPkg,
      JSON.stringify(
        { name: "theoria-plugin-host", version: "0.0.0", private: true, dependencies: {} },
        null,
        2,
      ),
    );
  }
}

export function discoverPlugins(rootDir: string): InstalledPlugin[] {
  ensureHostDir(rootDir);
  const nm = path.join(rootDir, "node_modules");
  if (!fs.existsSync(nm)) return [];
  const out: InstalledPlugin[] = [];
  for (const entry of fs.readdirSync(nm, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      // Scoped packages: descend one level.
      const scopeDir = path.join(nm, entry.name);
      for (const inner of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!inner.isDirectory()) continue;
        const p = path.join(scopeDir, inner.name);
        const manifest = tryLoadManifest(p);
        if (manifest) out.push({ manifest, pluginDir: p });
      }
      continue;
    }
    const p = path.join(nm, entry.name);
    const manifest = tryLoadManifest(p);
    if (manifest) out.push({ manifest, pluginDir: p });
  }
  return out;
}

function tryLoadManifest(pluginDir: string): PluginManifest | null {
  const mf = path.join(pluginDir, "theoria-plugin.json");
  if (!fs.existsSync(mf)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(mf, "utf8"));
    const m = validateManifest(parsed);
    // The package's directory name must match the manifest name so that
    // instance resolution is unambiguous.
    if (path.basename(pluginDir) !== m.name && !pluginDir.endsWith(m.name)) {
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

export interface RegistryFile {
  instances: PluginInstance[];
  updatedAt: string;
}

export function loadInstances(rootDir: string): PluginInstance[] {
  const p = path.join(rootDir, "registry.json");
  if (!fs.existsSync(p)) return [];
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8")) as RegistryFile;
    return Array.isArray(json.instances) ? json.instances : [];
  } catch {
    return [];
  }
}

export function saveInstances(rootDir: string, instances: PluginInstance[]): void {
  ensureHostDir(rootDir);
  const p = path.join(rootDir, "registry.json");
  const tmp = `${p}.tmp-${process.pid}`;
  const json: RegistryFile = { instances, updatedAt: new Date().toISOString() };
  fs.writeFileSync(tmp, JSON.stringify(json, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
  try { fs.chmodSync(p, 0o600); } catch { /* best effort */ }
}

export function buildRoot(rootDir = defaultPluginsDir()): PluginsRoot {
  return {
    rootDir,
    plugins: discoverPlugins(rootDir),
    instances: loadInstances(rootDir),
  };
}

export function newInstanceId(): string {
  return crypto.randomUUID();
}

/** Strip fields that should never be exposed over the HTTP API (passwords). */
export function redactConfig(
  manifest: PluginManifest | undefined,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!manifest?.configSchema) return config;
  const out: Record<string, unknown> = { ...config };
  for (const [key, spec] of Object.entries(manifest.configSchema.properties ?? {})) {
    if (spec.format === "password" && typeof out[key] === "string" && out[key]) {
      out[key] = "••••••••";
    }
  }
  return out;
}
