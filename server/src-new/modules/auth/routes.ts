// ── Auth routes module ──

import type { FastifyInstance, FastifyRequest } from "fastify";

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/auth/me
  app.get("/me", { preHandler: [app.authenticate] }, async (req: FastifyRequest) => {
    return {
      user: {
        id: req.user._id,
        email: req.user.email,
        apiKey: req.user.apiKey,
      },
    };
  });

  // POST /api/auth/regenerate-key
  app.post("/regenerate-key", { preHandler: [app.authenticate] }, async (req: FastifyRequest, reply) => {
    const user = app.store.Users.updateApiKey(req.user._id);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return { apiKey: user.apiKey, message: "API key regenerated successfully" };
  });
}
