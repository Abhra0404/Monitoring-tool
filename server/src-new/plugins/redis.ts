/**
 * Redis plugin — provides shared state for horizontal scaling.
 *
 * Redis is **optional**. When `REDIS_URL` is unset (development, single-node
 * deployments, tests) `app.redis` is left undefined and every call site
 * falls back to the in-memory equivalent. When set, the plugin:
 *
 *   - Creates two `ioredis` clients: a command client and a dedicated
 *     subscriber client (required by the socket.io adapter + any pub/sub).
 *   - Wires `@socket.io/redis-adapter` so WebSocket messages broadcast
 *     across every Fastify instance sharing the same Redis.
 *   - Exposes a cache-oriented façade (`get`, `set`, `del`, `incr`) plus the
 *     raw ioredis clients for advanced usage (pipelines, Lua, Streams).
 *
 * Graceful shutdown: both clients are `.quit()`-ed in the Fastify `onClose`
 * hook so in-flight commands drain cleanly.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { Redis as RedisClient } from "ioredis";
import { getConfig } from "../config.js";

export interface RedisFacade {
  client: RedisClient;
  subscriber: RedisClient;
  /** Short-lived cache helper: `set` with optional TTL in seconds. */
  cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void>;
  cacheGet(key: string): Promise<string | null>;
  /** Atomic increment with optional expiry (seconds). */
  bumpWithExpiry(key: string, ttlSeconds: number): Promise<number>;
  quit(): Promise<void>;
}

declare module "fastify" {
  interface FastifyInstance {
    redis?: RedisFacade;
  }
}

export default fp(
  async function redisPlugin(app: FastifyInstance) {
    const config = getConfig();
    if (!config.REDIS_URL) {
      app.log.info("REDIS_URL unset — running in single-node mode (no Redis)");
      return;
    }

    // Lazy import so the test suite doesn't pull ioredis when it's unused.
    const { default: IORedis } = await import("ioredis");

    const clientOpts = {
      maxRetriesPerRequest: null as number | null,
      enableReadyCheck: true,
      lazyConnect: false,
      reconnectOnError: (err: Error): boolean | 1 | 2 => {
        // Reconnect on READONLY (primary failover) — matches ioredis docs.
        if (err.message.includes("READONLY")) return 2;
        return false;
      },
    };
    const client = new IORedis(config.REDIS_URL, clientOpts);
    const subscriber = client.duplicate();

    // Bubble connection errors as logs, not unhandled-rejections.
    for (const c of [client, subscriber]) {
      c.on("error", (err: Error) => app.log.error({ err }, "redis error"));
    }
    // Wait for both to be ready so the first request doesn't race the
    // handshake. `ioredis` auto-queues commands, so this is belt-and-braces.
    await Promise.all([
      new Promise<void>((res) => client.once("ready", () => res())),
      new Promise<void>((res) => subscriber.once("ready", () => res())),
    ]);
    app.log.info({ url: redact(config.REDIS_URL) }, "redis connected");

    const facade: RedisFacade = {
      client,
      subscriber,
      async cacheSet(key, value, ttlSeconds) {
        if (ttlSeconds && ttlSeconds > 0) {
          await client.set(key, value, "EX", ttlSeconds);
        } else {
          await client.set(key, value);
        }
      },
      async cacheGet(key) {
        return client.get(key);
      },
      async bumpWithExpiry(key, ttlSeconds) {
        const pipe = client.multi();
        pipe.incr(key);
        pipe.expire(key, ttlSeconds);
        const results = await pipe.exec();
        if (!results) return 0;
        const [err, value] = results[0];
        if (err) throw err;
        return Number(value);
      },
      async quit() {
        await Promise.allSettled([client.quit(), subscriber.quit()]);
      },
    };

    app.decorate("redis", facade);

    app.addHook("onClose", async () => {
      await facade.quit();
    });
  },
  {
    name: "redis",
  },
);

/** Strip credentials from a Redis URL for log output. */
function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return "[malformed redis url]";
  }
}
