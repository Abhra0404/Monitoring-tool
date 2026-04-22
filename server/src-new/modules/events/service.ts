/**
 * Event-timeline service.
 *
 * Centralised helper for publishing events to the unified timeline. Every
 * subsystem (metrics, alerts, http-checks, pipelines, heartbeats, reachability,
 * anomaly detection, incidents) calls `emitEvent` so the timeline captures
 * one consistent record regardless of producer.
 *
 * The call writes:
 *   - the in-memory event ring (for fast `/api/events` reads);
 *   - the Postgres `events` hypertable (via the store mutation bus);
 *   - a real-time `event` Socket.IO broadcast to connected dashboards.
 */

import type { Server as SocketIOServer } from "socket.io";
import type { Store } from "../../store/index.js";
import type {
  EventKind,
  EventRecord,
  EventSeverity,
} from "../../shared/types.js";

export interface EmitEventInput {
  userId: string;
  kind: EventKind;
  source: string;
  severity?: EventSeverity;
  title: string;
  detail?: Record<string, unknown>;
  time?: number;
}

/**
 * Append a new event to the unified timeline and broadcast it.
 *
 * Never throws — if Socket.IO is unavailable (tests) the write still lands in
 * the store and Postgres.
 */
export function emitEvent(
  store: Store,
  io: SocketIOServer | undefined | null,
  input: EmitEventInput,
): EventRecord | null {
  // Defensive for partial store mocks in unit tests — do not crash the
  // caller; skip emission if the Events section is missing.
  if (!store?.Events?.append) return null;
  const record = store.Events.append({
    userId: input.userId,
    time: input.time ?? Date.now(),
    kind: input.kind,
    source: input.source,
    severity: input.severity ?? "info",
    title: input.title,
    detail: input.detail ?? {},
  });
  try {
    io?.to("all").emit("event", record);
  } catch {
    // broadcasting failures must not break the producer
  }
  return record;
}
