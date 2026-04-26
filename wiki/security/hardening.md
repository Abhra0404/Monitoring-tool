# Production Hardening Checklist

A pragmatic checklist for production deployments. Walk through each section before exposing Theoria to the public internet or trusting it for incident detection.

## Server

- [ ] **`NODE_ENV=production`** — disables verbose error responses and pretty-print logs.
- [ ] **`JWT_SECRET`** — at least 32 random bytes; never reuse across environments.
  ```bash
  openssl rand -hex 32
  ```
- [ ] **`CORS_ORIGINS`** — explicit allowlist; never `*` in production.
- [ ] **`TRUSTED_PROXIES`** — set to your reverse proxy's CIDR so `X-Forwarded-*` headers are honoured only from it.
- [ ] **`INTERNAL_METRICS_TOKEN`** — required if `/internal/metrics` is reachable from outside the cluster.
- [ ] **`MAX_REQUEST_BODY=1mb`** (default) — confirm it's not raised carelessly.
- [ ] **`SENTRY_DSN`** configured for error visibility.

## TLS

- [ ] TLS 1.2 or 1.3 only at the proxy.
- [ ] HSTS header with `max-age=31536000; includeSubDomains; preload`.
- [ ] HTTP → HTTPS redirect.
- [ ] Certificate auto-renewal monitored (cert-manager / Caddy ACME / Let's Encrypt).

## Postgres

- [ ] **TLS required** — connection string contains `sslmode=verify-full` and `sslrootcert=…`.
- [ ] Theoria connects as a **dedicated, least-privilege** role (no superuser).
- [ ] Restrict `pg_hba.conf` to the app's source CIDR.
- [ ] Encrypted backups stored off-host.
- [ ] WAL archiving enabled for point-in-time recovery.

## Redis

- [ ] `requirepass` set, **or** ACL with a dedicated user.
- [ ] TLS enabled (`rediss://` URL).
- [ ] Bind to private interface only.
- [ ] `protected-mode yes`.

## Container / OS

- [ ] Run as **non-root** (UID 1001 in the default image).
- [ ] **Read-only root filesystem** (`readOnlyRootFilesystem: true` in K8s).
- [ ] **Drop all capabilities** (`capabilities.drop: ["ALL"]`).
- [ ] No privilege escalation (`allowPrivilegeEscalation: false`).
- [ ] Latest base image patches; rebuild monthly.
- [ ] If using systemd, hardened unit (see [agent installation](../agent/installation.md)) — `ProtectSystem=strict`, `NoNewPrivileges=true`, `PrivateTmp=true`, `DynamicUser=true`.

## Kubernetes-specific

- [ ] PodSecurityAdmission `restricted` profile on the namespace.
- [ ] NetworkPolicy restricting ingress to the ingress controller and egress to Postgres/Redis only.
- [ ] PodDisruptionBudget with `minAvailable: 1` (chart default).
- [ ] Resource requests AND limits set.
- [ ] Image pull policy: `IfNotPresent` with **digest-pinned** tag in production.
- [ ] Secrets via the secrets manager (External Secrets Operator, Vault, Sealed Secrets), not raw `Secret` manifests in git.

## Reverse proxy

- [ ] `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` headers set.
- [ ] WebSocket upgrade enabled with adequate idle timeout (≥ 120 s).
- [ ] Request body size limit ≤ Theoria's `MAX_REQUEST_BODY`.
- [ ] Access logs shipped to your SIEM.

## Authentication & authorisation

- [ ] First user (system bootstrap) has been replaced with a real, named operator account; bootstrap account disabled.
- [ ] Strong password policy at the SSO layer (Theoria itself accepts whatever your SSO provides; bring your own minimum length / MFA).
- [ ] Quarterly review of active API keys; revoke unused ones.

## Agents

- [ ] One API key **per host** (never shared).
- [ ] API keys delivered via your secrets manager, not committed to config repos.
- [ ] Agent runs as a dedicated user (the `DynamicUser` from systemd is ideal).
- [ ] Agent host's outbound firewall allows only the Theoria endpoint.
- [ ] If `--docker` is used, evaluate whether the agent host's containers' privileges are acceptable.

## Plugins

- [ ] Audit `permissions` of every installed plugin against its declared functionality.
- [ ] Pin plugin versions in your install scripts; don't auto-update.
- [ ] Disable plugin instances you're not actively using.

## Monitoring the monitor

- [ ] Prometheus scraping `/internal/metrics` with alerts on:
  - Error rate > 5 %
  - p95 latency > 1 s
  - DB pool > 80 %
  - Ingest queue > 5,000
- [ ] An **out-of-band** uptime check pings `/health` from a different region/provider.
- [ ] Alert delivery is tested monthly via a synthetic `critical` rule.

## Backups & DR

- [ ] Automated daily backup (see [Backup & Restore](../operations/backup-restore.md)).
- [ ] Backups stored off-site, encrypted at rest.
- [ ] Restore drill performed quarterly.
- [ ] RPO and RTO documented and reviewed annually.

## Incident readiness

- [ ] Runbook printed / linked from the on-call wiki ([runbook.md](../operations/runbook.md)).
- [ ] On-call rotation defined; PagerDuty / Opsgenie integration tested.
- [ ] A status page (Theoria's [built-in](../monitoring/incidents-and-status-page.md), or external) for end-user comms.
- [ ] Contact info for managed-database vendor on file.

## Auditability

- [ ] `audit_events` retention configured for your compliance window (`AUDIT_RETENTION_DAYS`).
- [ ] Audit log shipped to immutable storage (S3 with object lock, etc.).
- [ ] Quarterly review of admin actions.
