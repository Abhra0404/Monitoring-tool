// ── Authentication plugin — system user + API key auth hooks ──

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export default fp(
  async function authPlugin(app: FastifyInstance) {
    // Decorator for system-user auth (dashboard routes)
    app.decorate("authenticate", async function (req: FastifyRequest, reply: FastifyReply) {
      const user = app.store.systemUser || app.store.Users.findByEmail("system@theoria.local");
      if (!user) {
        return reply.status(500).send({ error: "System user not initialized" });
      }
      req.user = { ...user, password: "" };
    });

    // Decorator for API key auth (agent routes)
    app.decorate("authenticateApiKey", async function (req: FastifyRequest, reply: FastifyReply) {
      const authHeader = req.headers.authorization;
      const apiKey = authHeader?.split(" ")[1];

      if (!apiKey) {
        return reply.status(401).send({ error: "No API key provided" });
      }

      const user = app.store.Users.findByApiKey(apiKey);
      if (!user) {
        return reply.status(401).send({ error: "Invalid API key" });
      }

      req.user = { ...user, password: "" };
    });
  },
  {
    name: "auth",
    dependencies: ["store"],
  },
);

// Augment Fastify types
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateApiKey: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
