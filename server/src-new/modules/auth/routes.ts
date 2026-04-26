/**
 * Auth routes — registration, login, refresh, logout, and account helpers.
 *
 * Design choices:
 *  - Access tokens: short-lived JWT (default 15m).
 *  - Refresh tokens: opaque 256-bit random strings hashed with sha256 in the
 *    `refresh_tokens` table. Rotation-on-refresh (the old token is revoked
 *    atomically with issuing the new pair).
 *  - Passwords: bcrypt with cost 12.
 *  - Self-registration only permitted when ALLOW_REGISTRATION=true or during
 *    bootstrap (no non-system users exist).
 *  - Per-route rate limits on /login and /refresh to curb brute-force.
 */

import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getConfig } from "../../config.js";
import { hashRefreshToken } from "../../plugins/auth.js";
import type { SystemUser } from "../../shared/types.js";

const BCRYPT_COST = 12;

// Pre-computed real bcrypt hash of an arbitrary throw-away password. Used
// as the dummy compare target for missing-user login attempts so the
// timing characteristic matches the hot path. Computed at module load.
const BCRYPT_DUMMY_HASH = bcrypt.hashSync("theoria-dummy-password", BCRYPT_COST);

// Serialise concurrent POST /api/auth/register on first boot so two races
// can't both observe `countNonSystem === 0` and both get admin.
let registrationChain: Promise<unknown> = Promise.resolve();

// ── JSON Schemas ──────────────────────────────────────────────────────────

const credentialsSchema = {
  type: "object" as const,
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email", maxLength: 255 },
    password: { type: "string", minLength: 8, maxLength: 256 },
  },
  additionalProperties: false,
};

const refreshSchema = {
  type: "object" as const,
  required: ["refreshToken"],
  properties: {
    refreshToken: { type: "string", minLength: 16, maxLength: 1024 },
  },
  additionalProperties: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────

function publicUser(u: SystemUser): {
  id: string;
  email: string;
  role: "admin" | "user";
  apiKey: string;
} {
  return { id: u._id, email: u.email, role: u.role, apiKey: u.apiKey };
}

function badCredentials(reply: FastifyReply): FastifyReply {
  return reply.status(401).send({ error: "Invalid email or password" });
}

// ── Routes ────────────────────────────────────────────────────────────────

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const config = getConfig();

  // POST /api/auth/register — self-registration (gated)
  app.post(
    "/register",
    {
      schema: { body: credentialsSchema },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { email, password } = req.body as { email: string; password: string };

      // Serialise against concurrent first-boot registrations.
      const run = registrationChain.then(async () => {
        const bootstrapping = app.store.Users.countNonSystem() === 0;
        if (!bootstrapping && !config.ALLOW_REGISTRATION) {
          return { status: 403 as const, body: { error: "Registration is disabled" } };
        }
        if (app.store.Users.findByEmail(email)) {
          return { status: 409 as const, body: { error: "Email already registered" } };
        }
        const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
        // Re-check after the hash — another request may have created the admin.
        if (bootstrapping && app.store.Users.countNonSystem() > 0) {
          return { status: 409 as const, body: { error: "Email already registered" } };
        }
        const user = app.store.Users.create({
          email,
          password: passwordHash,
          role: bootstrapping ? "admin" : "user",
          isSystem: false,
        });
        const tokens = await app.signTokens(user);
        return { status: 201 as const, body: { user: publicUser(user), ...tokens } };
      });
      registrationChain = run.catch(() => undefined);
      const result = await run;
      return reply.status(result.status).send(result.body);
    },
  );

  // POST /api/auth/login
  app.post(
    "/login",
    {
      schema: { body: credentialsSchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { email, password } = req.body as { email: string; password: string };
      const ip = req.ip;

      // Soft lock first — costs a single Redis lookup per request.
      const lock = await app.lockout.isLocked(email, ip);
      if (lock.locked) {
        return reply
          .status(429)
          .header("Retry-After", String(lock.retryInSec))
          .send({ error: "Too many failed attempts. Try again later.", retryInSec: lock.retryInSec });
      }

      const user = app.store.Users.findByEmail(email);
      // Always run bcrypt against a real hash to defeat user-enumeration
      // timing leaks. Using a malformed/short hash makes bcrypt return
      // immediately, which is itself a timing oracle (round-2 audit #10).
      const ok =
        user && !user.isSystem
          ? await bcrypt.compare(password, user.password || "")
          : await bcrypt.compare(password, BCRYPT_DUMMY_HASH).then(() => false);
      if (!user || user.isSystem || !ok) {
        const outcome = await app.lockout.recordFailure(email, ip);
        app.store.AuditLog.record({
          userId: user?._id ?? null,
          action: "auth.login.failed",
          detail: { email, remaining: outcome.remaining, locked: outcome.locked },
          ip,
          userAgent: req.headers["user-agent"] ?? null,
        });
        return badCredentials(reply);
      }

      await app.lockout.recordSuccess(email, ip);
      app.store.AuditLog.record({
        userId: user._id,
        action: "auth.login.success",
        detail: { email },
        ip,
        userAgent: req.headers["user-agent"] ?? null,
      });

      const tokens = await app.signTokens(user);
      return { user: publicUser(user), ...tokens };
    },
  );

  // POST /api/auth/refresh — rotate refresh token
  app.post(
    "/refresh",
    {
      schema: { body: refreshSchema },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { refreshToken } = req.body as { refreshToken: string };
      const hash = hashRefreshToken(refreshToken);
      const record = app.store.RefreshTokens.findValidByHash(hash);
      if (!record) {
        return reply.status(401).send({ error: "Invalid or expired refresh token" });
      }
      const user = app.store.Users.findById(record.userId);
      if (!user || user.isSystem) {
        return reply.status(401).send({ error: "Unknown user" });
      }
      // Rotation: revoke current, issue new.
      app.store.RefreshTokens.revoke(hash);
      const tokens = await app.signTokens(user);
      return { user: publicUser(user), ...tokens };
    },
  );

  // POST /api/auth/logout — revoke one refresh token
  app.post(
    "/logout",
    {
      schema: { body: refreshSchema },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req: FastifyRequest) => {
      const { refreshToken } = req.body as { refreshToken: string };
      app.store.RefreshTokens.revoke(hashRefreshToken(refreshToken));
      return { success: true };
    },
  );

  // POST /api/auth/onboarding/verify — public, but rate-limited.
  // Agents call this with { token } on first-run to fetch { url, apiKey }.
  // The token's nonce is consumed atomically so replay is rejected.
  app.post(
    "/onboarding/verify",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["token"],
          properties: { token: { type: "string", minLength: 16, maxLength: 2048 } },
          additionalProperties: false,
        },
      },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { token } = req.body as { token: string };
      let payload: { typ?: string; url?: string; apiKey?: string; serverId?: string | null; nonce?: string };
      try {
        payload = (await app.jwt.verify(token)) as typeof payload;
      } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
      }
      if (payload.typ !== "onboard" || !payload.nonce || !payload.url || !payload.apiKey) {
        return reply.status(400).send({ error: "Malformed onboarding token" });
      }
      if (!app.store.OnboardingNonces.consume(payload.nonce)) {
        return reply.status(401).send({ error: "Onboarding token already used or expired" });
      }
      return {
        url: payload.url,
        apiKey: payload.apiKey,
        serverId: payload.serverId ?? null,
      };
    },
  );

  // ── Authenticated routes ────────────────────────────────────────────
  app.register(async function (protectedRoutes) {
    protectedRoutes.addHook("preHandler", app.authenticate);

    // GET /api/auth/me
    protectedRoutes.get("/me", async (req) => {
      const u = app.store.Users.findById(req.user._id);
      if (!u) return { user: null };
      return { user: publicUser(u) };
    });

    // POST /api/auth/regenerate-key
    protectedRoutes.post("/regenerate-key", async (req, reply) => {
      const user = app.store.Users.updateApiKey(req.user._id);
      if (!user) return reply.status(404).send({ error: "User not found" });
      app.store.AuditLog.record({
        userId: user._id,
        action: "auth.api_key.rotated",
        detail: { email: user.email },
        ip: req.ip,
        userAgent: req.headers["user-agent"] ?? null,
      });
      return { apiKey: user.apiKey, message: "API key regenerated" };
    });

    // GET /api/auth/audit-log — recent security events for the current user.
    protectedRoutes.get("/audit-log", async (req) => {
      const entries = app.store.AuditLog.find({ userId: req.user._id, limit: 200 });
      return { entries };
    });

    // POST /api/auth/logout-all — revoke every refresh token for this user
    protectedRoutes.post("/logout-all", async (req) => {
      const count = app.store.RefreshTokens.revokeAllForUser(req.user._id);
      return { revoked: count };
    });

    // POST /api/auth/onboarding-token — short-lived token agents use to
    // discover the server URL + API key during first-run `theoria-cli agent
    // --token <jwt>`.
    //
    // The token is a JWT signed with the server's JWT_SECRET and carries a
    // random nonce; the nonce is tracked in memory and consumed on first use
    // so the token is effectively single-use. An expired nonce is treated
    // as expired regardless of the JWT `exp` claim.
    protectedRoutes.post(
      "/onboarding-token",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const user = app.store.Users.findById(req.user._id);
        if (!user) return reply.status(404).send({ error: "User not found" });

        const body = (req.body ?? {}) as { baseUrl?: string; serverId?: string };
        // Onboarding tokens are signed with the server's JWT_SECRET and
        // carry a `url` claim that the agent CLI POSTs back to with the
        // user's apiKey. We MUST NOT honour client-supplied Host /
        // X-Forwarded-* values here, otherwise an attacker who tricks an
        // admin into hitting a malicious /api/auth/onboarding-token can
        // exfiltrate that admin's apiKey on first redemption (round-2
        // audit #9). When PUBLIC_BASE_URL is not configured we fall back
        // to the request's own (unforwarded) protocol+host — only safe
        // because that path requires the attacker to already control the
        // socket.
        const configuredBase = (process.env.PUBLIC_BASE_URL || "").trim();
        let baseUrl: string;
        if (configuredBase) {
          if (typeof body.baseUrl === "string" && body.baseUrl.trim() && body.baseUrl.trim() !== configuredBase) {
            return reply.status(400).send({ error: "baseUrl must match PUBLIC_BASE_URL" });
          }
          baseUrl = configuredBase;
        } else {
          baseUrl = `${req.protocol}://${req.hostname}`;
        }

        const nonce = (await import("crypto")).randomBytes(16).toString("base64url");
        const payload = {
          typ: "onboard",
          url: baseUrl,
          apiKey: user.apiKey,
          serverId: body.serverId ?? null,
          nonce,
        };
        const token = await app.jwt.sign(payload, { expiresIn: "10m" });
        app.store.OnboardingNonces.add(nonce, 10 * 60_000);
        return { token, url: baseUrl, expiresIn: 600 };
      },
    );
  });
}
