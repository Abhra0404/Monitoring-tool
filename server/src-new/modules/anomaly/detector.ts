/**
 * Online anomaly detector.
 *
 * Maintains a rolling baseline per `(userId, serverId, metricName,
 * hourOfWeek)` bucket (0…167) using Welford's algorithm so we never
 * accumulate the full raw history. When a new value arrives and has enough
 * prior samples (>= MIN_SAMPLES), we compute the Z-score against the bucket
 * mean / stddev. |z| >= ANOMALY_Z triggers an anomaly event.
 *
 * Buckets are bounded: rarely-visited buckets that haven't seen a sample in
 * 60 days are evicted via periodic sweep. This keeps memory predictable
 * (168 buckets × N metrics × M servers, which is tiny in practice).
 *
 * The detector is intentionally self-contained in memory — no TimescaleDB
 * dependency — so Z-score scoring works in zero-config deployments too. A
 * future optimisation can sync from `metrics_1m` on boot.
 */

const MIN_SAMPLES = 30;
const ANOMALY_Z = 3;
const BUCKET_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const EWMA_WINDOW = 500; // cap sample count per bucket to keep stddev responsive

interface Bucket {
  n: number;
  mean: number;
  m2: number; // sum of squared diffs from mean (Welford)
  lastSeen: number;
}

const buckets = new Map<string, Bucket>();

function hourOfWeek(ts: number): number {
  const d = new Date(ts);
  // 0 (Sun) … 6 (Sat) × 24 + hour
  return d.getUTCDay() * 24 + d.getUTCHours();
}

function keyFor(
  userId: string,
  serverId: string,
  metric: string,
  ts: number,
): string {
  return `${userId}|${serverId}|${metric}|${hourOfWeek(ts)}`;
}

export interface AnomalyResult {
  zScore: number;
  mean: number;
  stddev: number;
  samples: number;
}

/**
 * Observe a new sample and return an AnomalyResult iff it is anomalous
 * (|z| >= ANOMALY_Z). Normal observations return `null` but still update
 * the baseline.
 */
export function observe(
  userId: string,
  serverId: string,
  metric: string,
  value: number,
  timestamp: number = Date.now(),
): AnomalyResult | null {
  if (!Number.isFinite(value)) return null;
  const key = keyFor(userId, serverId, metric, timestamp);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { n: 0, mean: 0, m2: 0, lastSeen: timestamp };
    buckets.set(key, bucket);
  }

  // Snapshot the previous distribution BEFORE absorbing the new sample so a
  // genuine outlier is flagged rather than smoothed away.
  const prevN = bucket.n;
  const prevMean = bucket.mean;
  const prevStddev =
    prevN >= 2 ? Math.sqrt(bucket.m2 / (prevN - 1)) : 0;

  // Update baseline (bounded-window Welford)
  if (bucket.n >= EWMA_WINDOW) {
    // Shrink history influence so stddev stays responsive.
    bucket.m2 *= (EWMA_WINDOW - 1) / EWMA_WINDOW;
    bucket.n = EWMA_WINDOW - 1;
  }
  bucket.n += 1;
  const delta = value - bucket.mean;
  bucket.mean += delta / bucket.n;
  bucket.m2 += delta * (value - bucket.mean);
  bucket.lastSeen = timestamp;

  if (prevN < MIN_SAMPLES || prevStddev === 0) return null;
  const z = (value - prevMean) / prevStddev;
  if (Math.abs(z) < ANOMALY_Z) return null;
  return { zScore: z, mean: prevMean, stddev: prevStddev, samples: prevN };
}

/** Test-only helpers. */
export function _reset(): void {
  buckets.clear();
}

export function _sweepOldBuckets(now: number = Date.now()): number {
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastSeen > BUCKET_TTL_MS) {
      buckets.delete(key);
      removed++;
    }
  }
  return removed;
}

export function _size(): number {
  return buckets.size;
}

setInterval(() => _sweepOldBuckets(), 60 * 60 * 1000).unref?.();
