# Synthetic Checks

Synthetic checks probe your services on a schedule from inside the Theoria server. There are four kinds — HTTP, TCP, Ping, and DNS — and they share an identical CRUD surface.

## HTTP checks

```bash
curl -X POST https://monitor.example.com/api/http-checks \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Public website",
    "url": "https://example.com/health",
    "intervalSeconds": 60,
    "expectedStatus": 200,
    "timeoutMs": 10000
  }'
```

| Field | Default | Notes |
|---|---|---|
| `url` | — | Must be `http://` or `https://` |
| `intervalSeconds` | `60` | Cadence of probes |
| `expectedStatus` | `200` | Pass criteria |
| `timeoutMs` | `10000` | Max wait per attempt |

The runner records latency, status code, SSL expiry (for HTTPS), and computes a rolling 30-day uptime percentage. Each attempt is stored in the `http_check_results` hypertable.

### SSL expiry

For HTTPS URLs the runner inspects the leaf certificate and updates `ssl_expiry`. The dashboard surfaces a warning when expiry is < 30 days, an error when < 7 days, and a critical alert when expired. No additional rule is needed.

### HTTP check body matching *(Phase 2+)*

Future versions will support response-body assertions (substring, JSON path, regex). Track progress in [v2 plan](../../plans/v2-implementation-plan.md).

---

## TCP checks

```bash
curl -X POST https://monitor.example.com/api/tcp-checks \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Postgres reachable",
    "host": "db.internal",
    "port": 5432,
    "intervalSeconds": 30,
    "timeoutMs": 5000
  }'
```

The runner attempts a TCP `connect` and immediately closes. Pass = handshake completed within `timeoutMs`. No data is sent.

Use TCP checks for databases, message brokers, and any backend service that doesn't expose an HTTP health endpoint.

---

## Ping checks

```bash
curl -X POST https://monitor.example.com/api/ping-checks \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Edge router",
    "host": "edge-1.internal",
    "intervalSeconds": 30
  }'
```

ICMP echo with the same host validation rule as DNS (`^[a-zA-Z0-9._-]+$`). Note: ICMP requires that the Theoria server process either runs as root or has the `cap_net_raw` capability. In Docker, run with `--cap-add=NET_RAW`. In Kubernetes, set:

```yaml
securityContext:
  capabilities:
    add: ["NET_RAW"]
```

If you can't grant the capability, use a TCP check on a port the host always exposes (e.g. SSH `22`).

---

## DNS checks

```bash
curl -X POST https://monitor.example.com/api/dns-checks \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MX record present",
    "domain": "example.com",
    "recordType": "MX",
    "expected": "aspmx.l.google.com",
    "intervalSeconds": 300
  }'
```

| Field | Notes |
|---|---|
| `recordType` | `A` · `AAAA` · `CNAME` · `MX` · `TXT` · `NS` · `SOA` |
| `expected` | Optional substring assertion against the resolved value |

Use DNS checks to detect mistakenly deleted records, dangling delegations, or mail-routing breakage.

---

## CRUD operations (all four kinds)

| Action | Method | Path |
|---|---|---|
| List | `GET` | `/api/<kind>-checks` |
| Detail | `GET` | `/api/<kind>-checks/:id` |
| Create | `POST` | `/api/<kind>-checks` |
| Toggle | `PATCH` | `/api/<kind>-checks/:id/toggle` |
| Delete | `DELETE` | `/api/<kind>-checks/:id` |

Replace `<kind>` with `http`, `tcp`, `ping`, or `dns`.

The list endpoint strips the `results` array from each check for a fast initial page; fetch detail or query the hypertable for full history.

## Real-time updates

Each completed check emits a `check:result` Socket.IO event:

```json
{
  "checkId": "uuid",
  "kind": "http",
  "status": "ok",
  "latency": 142,
  "statusCode": 200
}
```

Failed checks include an `error` string. The dashboard's "Synthetics" page uses this to update without refetching.

## Where checks run

All check schedulers run **inside the Theoria server process**. There are no separate workers. This means:

- Every replica in an HA deployment runs every check. To avoid duplicate work, the scheduler uses a Redis distributed lock (acquired per check, released on completion) when `REDIS_URL` is configured.
- Latency is measured from the Theoria server's POV. If you need to monitor from multiple geographies, run multiple Theoria deployments and aggregate downstream.
