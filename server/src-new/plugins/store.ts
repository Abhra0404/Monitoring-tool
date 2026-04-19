// ── Store plugin — injects the in-memory store into the Fastify instance ──

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import store from "../store/index.js";

export default fp(
  async function storePlugin(app: FastifyInstance) {
    app.decorate("store", store);
  },
  { name: "store" },
);
