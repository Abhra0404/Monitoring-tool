// ── Socket.IO plugin — eliminates global.io ──

import fp from "fastify-plugin";
import { Server } from "socket.io";
import type { FastifyInstance } from "fastify";

export default fp(
  async function socketioPlugin(app: FastifyInstance) {
    const io = new Server(app.server, {
      cors: { origin: "*" },
    });

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
  { name: "socketio" },
);
