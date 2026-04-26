// ── Socket.IO plugin — eliminates global.io ──
//
// When `app.redis` is present (Phase 6 horizontal scaling), the `@socket.io/
// redis-adapter` is attached so broadcasts fan out to every replica sharing
// the same Redis. Otherwise the default in-memory adapter is used.

import fp from "fastify-plugin";
import { Server } from "socket.io";
import type { FastifyInstance } from "fastify";
import { getConfig } from "../config.js";

function extractBearer(h: string | string[] | undefined): string | undefined {
  const v = Array.isArray(h) ? h[0] : h;
  if (!v) return undefined;
  const m = v.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : undefined;
}

export default fp(
  async function socketioPlugin(app: FastifyInstance) {
    const config = getConfig();
    const corsOrigins =
      config.CORS_ORIGINS === "*"
        ? "*"
        : config.CORS_ORIGINS.split(",").map((s) => s.trim());

    const io = new Server(app.server, {
      cors: { origin: corsOrigins },
    });

    // Require a valid JWT on connect. Clients pass it via `auth.token` in the
    // handshake. Without this, anyone who can reach the port receives every
    // broadcast (metrics, alerts, etc).
    io.use(async (socket, next) => {
      const token =
        (socket.handshake.auth as { token?: string } | undefined)?.token ||
        extractBearer(socket.handshake.headers.authorization);
      if (!token) return next(new Error("unauthorized"));
      try {
        const payload = (await app.jwt.verify(token)) as { sub: string };
        (socket.data as { userId?: string }).userId = payload.sub;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });

    if (app.redis) {
      try {
        const { createAdapter } = await import("@socket.io/redis-adapter");
        io.adapter(createAdapter(app.redis.client, app.redis.subscriber));
        app.log.info("socket.io redis adapter attached — multi-replica broadcasts enabled");
      } catch (err) {
        app.log.warn({ err }, "failed to attach socket.io redis adapter — falling back to in-memory");
      }
    }

    io.on("connection", (socket) => {
      const userId = (socket.data as { userId?: string }).userId;
      app.log.info({ socketId: socket.id, userId }, "Client connected");
      socket.join("all");
      if (userId) socket.join(`user:${userId}`);
      socket.on("disconnect", () => {
        app.log.info({ socketId: socket.id, userId }, "Client disconnected");
      });
    });

    app.decorate("io", io);

    app.addHook("onClose", async () => {
      io.close();
    });
  },
  { name: "socketio", dependencies: ["redis", "auth"] },
);
