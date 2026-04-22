import { describe, it, expect } from "vitest";
import { flattenOtlpRequest } from "./routes.js";

describe("flattenOtlpRequest", () => {
  it("returns [] for empty / malformed input", () => {
    expect(flattenOtlpRequest({})).toEqual([]);
    expect(flattenOtlpRequest({ resourceMetrics: [] })).toEqual([]);
  });

  it("flattens a gauge data point with resource + point attributes", () => {
    const out = flattenOtlpRequest({
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "api" } },
              { key: "host.id", value: { stringValue: "web-01" } },
            ],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "http.server.active_requests",
                  gauge: {
                    dataPoints: [
                      {
                        attributes: [{ key: "route", value: { stringValue: "/api/users" } }],
                        timeUnixNano: "1700000000000000000",
                        asInt: "42",
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("http.server.active_requests");
    expect(out[0].value).toBe(42);
    expect(out[0].labels).toEqual({
      "service.name": "api",
      "host.id": "web-01",
      route: "/api/users",
    });
    expect(out[0].timestamp.getTime()).toBe(1_700_000_000_000); // nano → ms
  });

  it("flattens a sum with a double value", () => {
    const out = flattenOtlpRequest({
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "http.server.requests",
                  sum: { isMonotonic: true, dataPoints: [{ asDouble: 1234.5 }] },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toEqual([
      {
        name: "http.server.requests",
        value: 1234.5,
        labels: {},
        timestamp: expect.any(Date),
      },
    ]);
  });

  it("expands a histogram into _count / _sum / _bucket{le=…} in Prometheus style", () => {
    const out = flattenOtlpRequest({
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "http.server.duration",
                  histogram: {
                    dataPoints: [
                      {
                        count: "6",
                        sum: 123.4,
                        bucketCounts: ["1", "2", "3"],
                        explicitBounds: [0.1, 1.0],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    // _count + _sum + 3 buckets (le=0.1, le=1, le=+Inf) = 5 rows
    const names = out.map((r) => `${r.name}${r.labels.le ? `{le=${r.labels.le}}` : ""}`).sort();
    expect(names).toEqual([
      "http.server.duration_bucket{le=+Inf}",
      "http.server.duration_bucket{le=0.1}",
      "http.server.duration_bucket{le=1}",
      "http.server.duration_count",
      "http.server.duration_sum",
    ]);
    // Bucket values should be cumulative: 1, 1+2=3, 1+2+3=6
    const buckets = out
      .filter((r) => r.name === "http.server.duration_bucket")
      .sort((a, b) => (a.labels.le === "+Inf" ? 1 : b.labels.le === "+Inf" ? -1 : Number(a.labels.le) - Number(b.labels.le)))
      .map((r) => r.value);
    expect(buckets).toEqual([1, 3, 6]);
    const count = out.find((r) => r.name === "http.server.duration_count");
    const sum = out.find((r) => r.name === "http.server.duration_sum");
    expect(count?.value).toBe(6);
    expect(sum?.value).toBe(123.4);
  });

  it("skips data points without a numeric value", () => {
    const out = flattenOtlpRequest({
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "broken.metric",
                  gauge: {
                    dataPoints: [{ asDouble: undefined as unknown as number }, { asInt: "not-a-number" }],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("skips metrics with an empty name", () => {
    const out = flattenOtlpRequest({
      resourceMetrics: [
        { scopeMetrics: [{ metrics: [{ name: "", gauge: { dataPoints: [{ asInt: "1" }] } }] }] },
      ],
    });
    expect(out).toEqual([]);
  });
});
