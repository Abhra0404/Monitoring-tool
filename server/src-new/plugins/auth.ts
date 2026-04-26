/**
 * Authentication plugin.
 *
 * Provides three capabilities:
 *   1. `app.jwt` — signing/verification via @fastify/jwt (HS256).
 *   2. `app.authenticate` — preHandler that requires a valid JWT bearer token
 *      and attaches an `AuthContext` to `req.user`.
 *   3. `app.authenticateApiKey` — preHandler that authenticates agents via
 *      `Authorization: Bearer <api-key>`.
 *
 * Refresh tokens are NOT JWTs — they are opaque random strings whose sha256
 * hash is stored in the `refresh_tokens` table. Rotation on refresh is
 * mandatory; the old hash is marked revoked and a new one issued.
 */

import crypto from "crypto";
import fp from "fastify-plugin";
import jwtPlugin from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getConfig } from "../config.js";
import type { AuthContext, SystemUser } from "../shared/types.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: "admin" | "user";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresAt: string;
}

/** Hash a raw refresh token so that the DB never stores the plaintext. */
export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function ttlToMs(ttl: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(ttl.trim());
  if (!m) throw new Error(`invalid TTL: ${ttl}`);
  const value = Number(m[1]);
  const unit = (m[2] ?? "s").toLowerCase();
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[unit];
}

function toAuthContext(user: SystemUser, via: "jwt" | "apiKey"): AuthContext {
  return {
    _id: user._id,
    email: user.email,
    apiKey: user.apiKey,
    role: user.role,
    isSystem: user.isSystem,
    via,
  };
}

export default fp(
  async function authPlugin(app: FastifyInstance) {
    const config = getConfig();

    await app.register(jwtPlugin, {
      secret: config.JWT_SECRET,
      sign: { expiresIn: config.JWT_ACCESS_TTL, algorithm: "HS256" },
    });

    // Helper: sign an access+refresh token pair for a user.
    app.decorate("signTokens", async function signTokens(
      user: SystemUser,
    ): Promise<TokenPair> {
      const payload: AccessTokenPayload = {
        sub: user._id,
        email: user.email,
        role: user.role,
      };
      const accessToken = await app.jwt.sign(payload);

      // Opaque refresh token — 256 bits of entropy, URL-safe base64.
      const raw = crypto.randomBytes(32).toString("base64url");
      const hash = hashRefreshToken(raw);
      const expiresAt = new Date(Date.now() + ttlToMs(config.JWT_REFRESH_TTL));
      app.store.RefreshTokens.create({
        userId: user._id,
        tokenHash: hash,
        expiresAt: expiresAt.toISOString(),
      });

      return {
        accessToken,
        refreshToken: raw,
        accessTokenExpiresIn: config.JWT_ACCESS_TTL,
        refreshTokenExpiresAt: expiresAt.toISOString(),
      };
    });

    // JWT-based dashboard authentication.
    app.decorate("authenticate", async function (
      req: FastifyRequest,
      reply: FastifyReply,
    ) {
      const auth = req.headers.authorization;
      if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
        return reply.status(401).send({ error: "Missing bearer token" });
      }
      const token = auth.slice(7).trim();
      let payload: AccessTokenPayload;
      try {
        payload = (await app.jwt.verify(token)) as AccessTokenPayload;
      } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
      }
      const user = app.store.Users.findById(payload.sub);
      if (!user || user.isSystem) {
        return reply.status(401).send({ error: "Unknown user" });
      }
      req.user = toAuthContext(user, "jwt");
    });

    // Admin-only guard. Use AFTER `authenticate` in a route's preHandler chain.
    app.decorate("requireAdmin", async function (
      req: FastifyRequest,
      reply: FastifyReply,
    ) {
      if (!req.user || req.user.role !== "admin") {
        return reply.status(403).send({ error: "Admin role required" });
      }
    });

    // API-key based agent authentication.
    app.decorate("authenticateApiKey", async function (
      req: FastifyRequest,
      reply: FastifyReply,
    ) {
      const auth = req.headers.authorization;
      const apiKey = auth?.toLowerCase().startsWith("bearer ")
        ? auth.slice(7).trim()
        : undefined;
      if (!apiKey) {
        return reply.status(401).send({ error: "No API key provided" });
      }
      const user = app.store.Users.findByApiKey(apiKey);
      if (!user) {
        return reply.status(401).send({ error: "Invalid API key" });
      }
      req.user = toAuthContext(user, "apiKey");
    });
  },
  {
    name: "auth",
    dependencies: ["store"],
  },
);

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateApiKey: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    signTokens: (user: SystemUser) => Promise<TokenPair>;
  }
}
