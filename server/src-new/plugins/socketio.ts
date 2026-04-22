// ── Socket.IO plugin — eliminates global.io ──
//
// When `app.redis` is present (Phase 6 horizontal scaling), the `@socket.io/
// redis-adapter` is attached so broadcasts fan out to every replica sharing
// the same Redis. Otherwise the default in-memory adapter is used.

import fp from "fastify-plugin";
import { Server } from "socket.io";
import type { FastifyInstance } from "fastify";
import { getConfig } from "../config.js";

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
      app.log.info(`Client connected: ${socket.id}`);
      socket.join("all");
      socket.on("disconnect", () => {
        app.log.info(`Client disconnected: ${socket.id}`);
      });
    });

    app.decorate("io", io);

    app.addHook("onClose", async () => {
      io.close();
    });
  },
  { name: "socketio", dependencies: ["redis"] },
);
