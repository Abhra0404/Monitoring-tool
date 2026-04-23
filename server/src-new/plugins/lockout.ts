/**
 * Account lockout — defence against password brute-force.
 *
 * After `MAX_FAILURES` failed password attempts within `WINDOW_MS` for a
 * given (email, IP) pair, the account is soft-locked for `LOCK_MS`. Every
 * attempt during the lock extends the timer (sliding window).
 *
 * Backing store:
 *   - Default: process-local `Map` (fine for single-node deployments).
 *   - When `app.redis` is configured, counters + lock keys are replicated
 *     to Redis with matching TTLs so the lockout applies consistently
 *     across replicas.
 *
 * The module is a Fastify plugin rather than a bare helper so the Redis
 * façade can be captured at registration time.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes sliding window
const LOCK_MS = 15 * 60 * 1000; // 15 minutes soft lock
const MAX_FAILURES = 5;

interface LocalCounter {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

declare module "fastify" {
  interface FastifyInstance {
    lockout: {
      isLocked(email: string, ip: string): Promise<{ locked: boolean; retryInSec: number }>;
      recordFailure(email: string, ip: string): Promise<{ locked: boolean; remaining: number }>;
      recordSuccess(email: string, ip: string): Promise<void>;
      /** Test helper — clears the in-memory map. */
      __resetForTests(): void;
    };
  }
}

function bucketKey(email: string, ip: string): string {
  return `${email.toLowerCase()}::${ip}`;
}

export default fp(
  async function lockoutPlugin(app: FastifyInstance) {
    const local = new Map<string, LocalCounter>();

    function localCleanup(now: number) {
      for (const [k, v] of local) {
        if (v.lockedUntil && v.lockedUntil < now) {
          local.delete(k);
        } else if (!v.lockedUntil && now - v.firstAt > WINDOW_MS) {
          local.delete(k);
        }
      }
    }

    async function isLockedRedis(email: string, ip: string): Promise<{ locked: boolean; retryInSec: number }> {
      const r = app.redis!;
      const key = `theoria:lockout:lock:${bucketKey(email, ip)}`;
      const ttl = await r.client.ttl(key);
      if (ttl > 0) return { locked: true, retryInSec: ttl };
      return { locked: false, retryInSec: 0 };
    }

    async function recordFailureRedis(email: string, ip: string): Promise<{ locked: boolean; remaining: number }> {
      const r = app.redis!;
      const b = bucketKey(email, ip);
      const countKey = `theoria:lockout:count:${b}`;
      const lockKey = `theoria:lockout:lock:${b}`;
      const count = await r.bumpWithExpiry(countKey, Math.ceil(WINDOW_MS / 1000));
      if (count >= MAX_FAILURES) {
        await r.client.set(lockKey, "1", "EX", Math.ceil(LOCK_MS / 1000));
        await r.client.del(countKey);
        app.store.AuditLog.record({
          userId: null,
          action: "account.locked",
          detail: { email, failures: count },
          ip,
          userAgent: null,
        });
        return { locked: true, remaining: 0 };
      }
      return { locked: false, remaining: MAX_FAILURES - count };
    }

    async function recordSuccessRedis(email: string, ip: string): Promise<void> {
      const r = app.redis!;
      const b = bucketKey(email, ip);
      await Promise.allSettled([
        r.client.del(`theoria:lockout:count:${b}`),
        r.client.del(`theoria:lockout:lock:${b}`),
      ]);
    }

    app.decorate("lockout", {
      async isLocked(email, ip) {
        if (app.redis) return isLockedRedis(email, ip);
        const now = Date.now();
        localCleanup(now);
        const c = local.get(bucketKey(email, ip));
        if (c?.lockedUntil && c.lockedUntil > now) {
          return { locked: true, retryInSec: Math.ceil((c.lockedUntil - now) / 1000) };
        }
        return { locked: false, retryInSec: 0 };
      },
      async recordFailure(email, ip) {
        if (app.redis) return recordFailureRedis(email, ip);
        const now = Date.now();
        const key = bucketKey(email, ip);
        localCleanup(now);
        const existing = local.get(key);
        const count = existing && now - existing.firstAt <= WINDOW_MS ? existing.count + 1 : 1;
        const firstAt = existing && now - existing.firstAt <= WINDOW_MS ? existing.firstAt : now;
        if (count >= MAX_FAILURES) {
          local.set(key, { count: 0, firstAt: now, lockedUntil: now + LOCK_MS });
          app.store.AuditLog.record({
            userId: null,
            action: "account.locked",
            detail: { email, failures: count },
            ip,
            userAgent: null,
          });
          return { locked: true, remaining: 0 };
        }
        // Preserve any active lock while updating the failure counter — don't
        // overwrite `lockedUntil` with 0 if a previous burst is still locked.
        const lockedUntil = existing?.lockedUntil && existing.lockedUntil > now ? existing.lockedUntil : 0;
        local.set(key, { count, firstAt, lockedUntil });
        return { locked: false, remaining: MAX_FAILURES - count };
      },
      async recordSuccess(email, ip) {
        if (app.redis) return recordSuccessRedis(email, ip);
        local.delete(bucketKey(email, ip));
      },
      __resetForTests() {
        local.clear();
      },
    });
  },
  {
    name: "lockout",
    dependencies: ["store", "redis"],
  },
);