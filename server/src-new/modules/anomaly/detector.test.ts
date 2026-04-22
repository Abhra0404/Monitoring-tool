import { describe, expect, it, beforeEach } from "vitest";
import { observe, _reset, _size } from "./detector.js";

describe("anomaly detector", () => {
  beforeEach(() => _reset());

  it("returns null while warming up below the min-samples threshold", () => {
    const base = new Date("2026-05-04T09:00:00Z").getTime();
    for (let i = 0; i < 10; i++) {
      const r = observe("u", "s", "cpu_usage", 50 + (i % 3), base + i * 60_000);
      expect(r).toBeNull();
    }
  });

  it("flags a clear outlier after the baseline stabilises", () => {
    const base = new Date("2026-05-04T09:00:00Z").getTime();
    // Feed 40 consistent values around 50
    for (let i = 0; i < 40; i++) {
      observe("u", "s", "cpu_usage", 50 + Math.sin(i) * 0.5, base + i * 60_000);
    }
    const anomaly = observe("u", "s", "cpu_usage", 99, base + 40 * 60_000);
    expect(anomaly).not.toBeNull();
    expect(Math.abs(anomaly!.zScore)).toBeGreaterThanOrEqual(3);
    expect(anomaly!.samples).toBeGreaterThanOrEqual(30);
  });

  it("does not flag values within the normal range", () => {
    const base = new Date("2026-05-04T09:00:00Z").getTime();
    for (let i = 0; i < 60; i++) {
      observe("u", "s", "cpu_usage", 50 + Math.sin(i) * 2, base + i * 60_000);
    }
    const within = observe("u", "s", "cpu_usage", 52, base + 60 * 60_000);
    expect(within).toBeNull();
  });

  it("buckets by hour-of-week so traffic peaks don't poison off-peak baselines", () => {
    // Same user/server/metric, different hours → different buckets
    const mondayNoon = new Date("2026-05-04T12:00:00Z").getTime();
    const tuesday3am = new Date("2026-05-05T03:00:00Z").getTime();
    for (let i = 0; i < 40; i++) {
      observe("u", "s", "load", 10, mondayNoon + i * 7 * 24 * 60 * 60 * 1000);
      observe("u", "s", "load", 1, tuesday3am + i * 7 * 24 * 60 * 60 * 1000);
    }
    // 5 during off-peak is still anomalous (mean ~1, stddev ~0 -> but there's
    // jitter from Welford so inject slight variance)
    for (let i = 0; i < 5; i++) {
      observe("u", "s", "load", 1 + (i % 2) * 0.01, tuesday3am + (41 + i) * 7 * 24 * 60 * 60 * 1000);
    }
    const off = observe("u", "s", "load", 20, tuesday3am + 200 * 7 * 24 * 60 * 60 * 1000);
    expect(off).not.toBeNull();
  });

  it("allocates one bucket per (user,server,metric,hourOfWeek) key", () => {
    const base = new Date("2026-05-04T09:00:00Z").getTime();
    observe("u1", "s1", "cpu", 50, base);
    observe("u1", "s2", "cpu", 50, base);
    observe("u2", "s1", "cpu", 50, base);
    expect(_size()).toBe(3);
  });
});
