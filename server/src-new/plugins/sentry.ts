/**
 * Sentry plugin — opt-in error reporting.
 *
 * Active only when `SENTRY_DSN` is set. In that mode we:
 *   - Initialise `@sentry/node` at boot with the current environment + release
 *     (derived from `SENTRY_RELEASE` or `package.json#version`).
 *   - Attach an `onError` hook that captures server-side 5xx errors with the
 *     current request scope (method, route, user id when authenticated).
 *   - Flush pending events on graceful shutdown so container kills don't
 *     drop the last error.
 *
 * Source-map uploads are handled by the release pipeline (`.github/workflows/
 * release.yml`) via `sentry-cli releases files upload-sourcemaps`. No
 * server-side plugin work is required for that.
 */

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getConfig } from "../config.js";

export default fp(
  async function sentryPlugin(app: FastifyInstance) {
    const config = getConfig();
    if (!config.SENTRY_DSN) {
      app.log.debug("SENTRY_DSN unset — Sentry disabled");
      return;
    }

    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.NODE_ENV,
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: 0,
      beforeSend(event) {
        // Redact the Authorization header — Sentry should never see it.
        if (event.request?.headers && typeof event.request.headers === "object") {
          const h = event.request.headers as Record<string, unknown>;
          if ("authorization" in h) h.authorization = "[REDACTED]";
          if ("Authorization" in h) h.Authorization = "[REDACTED]";
        }
        return event;
      },
    });

    app.addHook("onError", async (req: FastifyRequest, reply, err) => {
      // Fastify sets reply.statusCode to the error's status (e.g. 500) before
      // running the onError hook; req.raw.statusCode is still the default 200
      // until the reply is actually written. Use reply.statusCode.
      if (reply.statusCode && reply.statusCode < 500) return;
      Sentry.withScope((scope) => {
        scope.setTag("route", req.routeOptions?.url ?? req.url);
        scope.setTag("method", req.method);
        if (req.user) {
          scope.setUser({ id: req.user._id, email: req.user.email });
        }
        Sentry.captureException(err);
      });
    });

    app.addHook("onClose", async () => {
      await Sentry.flush(2000);
    });

    app.log.info({ environment: config.NODE_ENV }, "Sentry initialised");
  },
  { name: "sentry" },
);
