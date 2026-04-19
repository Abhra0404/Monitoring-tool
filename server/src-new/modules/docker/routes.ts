// ── Docker routes module ──

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export default async function dockerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // GET /api/docker — all containers across all servers
  app.get("/", async (req: FastifyRequest) => {
    return app.store.DockerContainers.findAll(req.user._id);
  });

  // GET /api/docker/:serverId — containers for a specific server
  app.get("/:serverId", async (req: FastifyRequest<{ Params: { serverId: string } }>) => {
    return app.store.DockerContainers.find(req.user._id, req.params.serverId);
  });
}
