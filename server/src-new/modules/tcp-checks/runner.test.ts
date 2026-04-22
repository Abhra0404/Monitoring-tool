/**
 * TCP check runner — end-to-end test against a real local net.Server.
 */

import net from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventEmitter } from "events";
import type { Server as SocketIOServer } from "socket.io";
import type { Store } from "../../store/index.js";
import { initTcpRunner, scheduleTcpCheck, unscheduleTcpCheck } from "./runner.js";

function makeFakeStore() {
  const checks = new Map<string, Record<string, unknown> & { results: unknown[] }>();
  return {
    TcpChecks: {
      findById: (id: string) => checks.get(id) ?? null,
      findActive: () => Array.from(checks.values()).filter((c) => c.isActive) as never,
      update: (id: string, u: Record<string, unknown>) => {
        const c = checks.get(id);
        if (!c) return null;
        Object.assign(c, u);
        return c;
      },
      _set: (c: Record<string, unknown> & { _id: string }) => {
        checks.set(c._id, { ...c, results: [] } as never);
      },
    },
  } as unknown as Store;
}

function makeFakeIo(): SocketIOServer {
  const bus = new EventEmitter();
  return {
    to: () => ({
      emit: (event: string, ...args: unknown[]) => {
        bus.emit(event, ...args);
        return true;
      },
    }),
    _bus: bus,
  } as unknown as SocketIOServer;
}

describe("TCP runner", () => {
  let server: net.Server;
  let port: number;
  let store: ReturnType<typeof makeFakeStore>;
  let io: SocketIOServer;

  beforeAll(async () => {
    server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    port = (server.address() as net.AddressInfo).port;
    store = makeFakeStore();
    io = makeFakeIo();
    initTcpRunner(store, io);
  });

  afterAll(() => {
    server.close();
  });

  it("reports up when the TCP port accepts connections", async () => {
    (store.TcpChecks as unknown as { _set: (c: Record<string, unknown>) => void })._set({
      _id: "tcp1", name: "local", host: "127.0.0.1", port,
      interval: 60_000, timeoutMs: 2_000, isActive: true,
    });
    const emitted: unknown[] = [];
    (io as unknown as { _bus: EventEmitter })._bus.on("tcpcheck:result", (e) => emitted.push(e));
    scheduleTcpCheck({ _id: "tcp1", interval: 60_000 });
    await new Promise((r) => setTimeout(r, 300));
    unscheduleTcpCheck("tcp1");
    expect(emitted.length).toBeGreaterThan(0);
    const first = emitted[0] as { status: string };
    expect(first.status).toBe("up");
  });

  it("reports down when the TCP port is closed", async () => {
    (store.TcpChecks as unknown as { _set: (c: Record<string, unknown>) => void })._set({
      _id: "tcp2", name: "closed", host: "127.0.0.1", port: 1,
      interval: 60_000, timeoutMs: 500, isActive: true,
    });
    const emitted: unknown[] = [];
    (io as unknown as { _bus: EventEmitter })._bus.on("tcpcheck:result", (e) => {
      if ((e as { checkId: string }).checkId === "tcp2") emitted.push(e);
    });
    scheduleTcpCheck({ _id: "tcp2", interval: 60_000 });
    await new Promise((r) => setTimeout(r, 1000));
    unscheduleTcpCheck("tcp2");
    expect(emitted.length).toBeGreaterThan(0);
    const first = emitted[0] as { status: string };
    expect(first.status).toBe("down");
  });
});
