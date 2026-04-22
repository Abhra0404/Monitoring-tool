/**
 * Store mutation bus.
 *
 * The in-memory store publishes every mutating operation to this bus.
 * The Postgres persistence plugin subscribes and mirrors writes to the DB
 * asynchronously so the hot path stays synchronous.
 *
 * Event shape:
 *  - kind: table name ("users", "servers", ...)
 *  - op:   "upsert" | "delete" | "batchInsert"
 *  - data: the entity or array of entities that changed
 */

type Listener = (event: MutationEvent) => void;

export interface MutationEvent {
  kind:
    | "users"
    | "servers"
    | "metrics"
    | "alertRules"
    | "alertHistory"
    | "httpChecks"
    | "httpCheckResults"
    | "pipelines"
    | "notificationChannels"
    | "dockerContainers"
    | "statusPageConfig"
    | "refreshTokens"
    | "events"
    | "tcpChecks"
    | "pingChecks"
    | "dnsChecks"
    | "heartbeatMonitors"
    | "incidents"
    | "incidentUpdates";
  op: "upsert" | "delete" | "batchInsert" | "update";
  data: unknown;
  // Optional scope hints for delete operations
  scope?: Record<string, string>;
}

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publish(event: MutationEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      // Listeners must not crash the hot path.
      // eslint-disable-next-line no-console
      console.error("[mutation-bus] listener threw:", (err as Error).message);
    }
  }
}
