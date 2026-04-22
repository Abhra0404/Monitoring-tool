# Security Policy

## Supported Versions

Theoria follows semantic versioning. Security fixes are backported to the
current minor release only.

| Version | Supported |
|---------|-----------|
| latest  | ✅         |
| older   | ❌         |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security reports.**

Please email **security@theoria.dev** with:

- A description of the issue and its impact.
- Steps to reproduce, proof-of-concept, or a minimal patch where possible.
- Your preferred contact and disclosure timeline.

We will acknowledge your report within **72 hours** and aim to provide an
initial mitigation plan within **7 days**. Coordinated disclosure timelines
are standard 90 days; we will credit reporters who wish to be named.

## Scope

In scope:
- The Theoria server (Fastify app, `@/server/src-new`).
- The in-box monitoring agent (`@/agent`).
- Official docker / helm artefacts shipped by this repository.

Out of scope:
- Reports relying on social engineering, physical access, or a compromised
  admin account.
- Findings against forks that have modified upstream code.
- Denial-of-service via network-level flooding (use rate-limit instead).

## Hardening Summary

- `@fastify/helmet` applies CSP and standard security headers in production.
- CORS is pinned in production — the server refuses to boot if
  `CORS_ORIGINS` is left at `*`.
- Account lockout: 5 failed logins per (email, IP) within 10 minutes
  triggers a 15-minute soft lock, with audit-log entries on every lock.
- Refresh tokens are stored sha256-hashed; raw tokens never touch disk.
- JWT access tokens default to 15-minute TTL, refresh tokens to 30 days.
- Every security-relevant event (`auth.login.failed`,
  `auth.login.success`, `auth.api_key.rotated`, `account.locked`) is
  written to the `auditLog` store.
- The server runs as a non-root user inside the official Docker image.

## Cryptography

- Passwords: **bcrypt** cost 12.
- API keys: 256-bit random, prefixed `thr_` and compared in constant time.
- Agent enrolment tokens: 15-minute JWTs signed with the server secret.
