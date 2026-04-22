/**
 * Plugin manifest schema and validator. A plugin lives on disk as an
 * installed npm package inside `~/.theoria/plugins/node_modules/<name>/`.
 * It must ship a `theoria-plugin.json` alongside its `package.json` and a
 * runnable entry module.
 *
 * We use a hand-rolled validator (no ajv/zod dep bloat) because the shape
 * is small and the server's Fastify instance already validates
 * user-supplied input via route JSON-Schema.
 */

export type PluginType =
  | "server-check"          // Runs inside a worker on a schedule; returns { status, latencyMs, detail }.
  | "notification-provider" // Exposes send(payload) to fire alerts.
  | "dashboard-panel"       // Contributes a React panel (metadata only, the client renders from remote URL or bundled asset).
  | "agent-collector";      // Documented; runs inside the Go agent, not the Node server. Listed but not scheduled here.

export interface PluginManifest {
  name: string;             // npm package name; must match directory name
  displayName?: string;
  version: string;
  type: PluginType;
  entry: string;            // Relative path to JS entry (CJS preferred for worker_threads)
  description?: string;
  author?: string;
  icon?: string;            // lucide-react icon name (e.g. "Database")

  /** Metric labels exposed (for server-check plugins). */
  metrics?: Array<{ name: string; unit?: string; description?: string }>;

  /** JSON-schema subset describing the user-configurable fields. */
  configSchema?: {
    type: "object";
    required?: string[];
    properties: Record<string, {
      type: "string" | "number" | "boolean";
      default?: unknown;
      description?: string;
      format?: "password" | "url" | "host";
      minimum?: number;
      maximum?: number;
    }>;
  };

  /** Default schedule interval in seconds for server-check plugins. */
  intervalSeconds?: number;

  /** Hard timeout in ms for one check invocation; enforced by the sandbox. */
  timeoutMs?: number;
}

export class ManifestValidationError extends Error {}

const ALLOWED_TYPES: PluginType[] = [
  "server-check",
  "notification-provider",
  "dashboard-panel",
  "agent-collector",
];

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function validateManifest(raw: unknown): PluginManifest {
  if (!raw || typeof raw !== "object") {
    throw new ManifestValidationError("manifest must be a JSON object");
  }
  const m = raw as Record<string, unknown>;

  if (typeof m.name !== "string" || !NAME_RE.test(m.name)) {
    throw new ManifestValidationError(`manifest.name must match ${NAME_RE}`);
  }
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+/.test(m.version)) {
    throw new ManifestValidationError("manifest.version must be semver");
  }
  if (typeof m.type !== "string" || !ALLOWED_TYPES.includes(m.type as PluginType)) {
    throw new ManifestValidationError(
      `manifest.type must be one of ${ALLOWED_TYPES.join(", ")}`,
    );
  }
  if (typeof m.entry !== "string" || m.entry.length === 0) {
    throw new ManifestValidationError("manifest.entry must be a non-empty path");
  }
  // Prevent directory traversal — plugins should only reference files within
  // their own package root.
  if (m.entry.includes("..") || m.entry.startsWith("/") || m.entry.startsWith("\\")) {
    throw new ManifestValidationError("manifest.entry must be a relative in-package path");
  }

  const intervalSeconds = typeof m.intervalSeconds === "number" && m.intervalSeconds > 0
    ? Math.min(m.intervalSeconds, 86_400)
    : 60;
  const timeoutMs = typeof m.timeoutMs === "number" && m.timeoutMs > 0
    ? Math.min(m.timeoutMs, 60_000)
    : 10_000;

  return {
    name: m.name,
    displayName: typeof m.displayName === "string" ? m.displayName : undefined,
    version: m.version,
    type: m.type as PluginType,
    entry: m.entry,
    description: typeof m.description === "string" ? m.description : undefined,
    author: typeof m.author === "string" ? m.author : undefined,
    icon: typeof m.icon === "string" ? m.icon : undefined,
    metrics: Array.isArray(m.metrics)
      ? (m.metrics as PluginManifest["metrics"])
      : undefined,
    configSchema: (m.configSchema ?? undefined) as PluginManifest["configSchema"],
    intervalSeconds,
    timeoutMs,
  };
}
