// ── Pipelines routes module ──

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { normalize } from "./normalizer.js";
import { dispatchPipelineFailure } from "../notifications/service.js";

export default async function pipelinesRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/pipelines/webhook — uses API key auth
  app.post("/webhook", { preHandler: [app.authenticateApiKey] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const normalized = normalize(
      req.headers as Record<string, string | string[] | undefined>,
      req.body as Record<string, unknown>,
    );
    if (!normalized) {
      return reply.status(400).send({ error: "Unrecognized webhook format" });
    }
    const pipeline = app.store.Pipelines.upsert(req.user._id, normalized.source, normalized.runId, normalized);
    app.io.to("all").emit("pipeline:update", pipeline);
    if (pipeline.status === "failure") {
      dispatchPipelineFailure(app.store, req.user._id, pipeline as unknown as Record<string, unknown>).catch((err: unknown) =>
        console.error("Pipeline notification error:", (err as Error).message),
      );
    }
    return { success: true, id: pipeline._id };
  });

  // Dashboard routes — system user auth
  app.register(async function dashboardPipelines(sub) {
    sub.addHook("preHandler", app.authenticate);

    // GET /api/pipelines
    sub.get("/", async (req: FastifyRequest<{ Querystring: { source?: string; status?: string; branch?: string; repo?: string; limit?: string } }>) => {
      const { source, status, branch, repo, limit } = req.query;
      const filter: Record<string, unknown> = {};
      if (source) filter.source = source;
      if (status) filter.status = status;
      if (branch) filter.branch = branch;
      if (repo) filter.repo = repo;
      if (limit) filter.limit = Number(limit);
      return app.store.Pipelines.find(req.user._id, filter);
    });

    // GET /api/pipelines/stats
    sub.get("/stats", async (req: FastifyRequest) => {
      return app.store.Pipelines.getStats(req.user._id);
    });

    // DELETE /api/pipelines/:runId
    sub.delete("/:runId", async (req: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const removed = app.store.Pipelines.delete(req.params.runId, req.user._id);
      if (!removed) return reply.status(404).send({ error: "Pipeline run not found" });
      return { success: true };
    });
  });
}
