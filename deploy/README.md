# Theoria Deploy Templates

Templates and sample configs for production deployment of Theoria.

## `Caddyfile.template`

A Caddy configuration that enables **custom-domain status pages with automatic HTTPS**.

### What it provides

- Automatic TLS certificate provisioning (via Let's Encrypt) for every
  hostname your tenants configure as a `customDomain` on their status page.
- An `on_demand_tls` "ask" endpoint (`/api/status-page/ask?domain=<host>`)
  that Theoria answers with 200 for known domains and 404 for anything else.
  This prevents random hostnames from exhausting your ACME rate limits.
- Host-header preservation so Theoria's status-page router can resolve
  the right tenant config.

### Quick start

```bash
# 1. Set environment variables (e.g. in /etc/caddy/caddy.env)
export DASHBOARD_DOMAIN=theoria.example.com
export THEORIA_UPSTREAM=127.0.0.1:4000
export ADMIN_EMAIL=ops@example.com

# 2. Copy the template
sudo cp deploy/Caddyfile.template /etc/caddy/Caddyfile

# 3. Validate + reload
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### Tenant onboarding

A tenant who wants `status.acme.com` to serve their status page needs to:

1. In the Theoria dashboard, open Status Page → set **Custom Domain** to
   `status.acme.com`.
2. Point a DNS record at Caddy:
   ```
   status.acme.com.  CNAME  theoria.example.com.
   ```
3. Visit `https://status.acme.com` — Caddy will request a certificate,
   Theoria will confirm the host is known, and Caddy will begin serving.

### Host resolution inside Theoria

`resolvePublicConfig(req)` (in `server/src-new/modules/status-page/routes.ts`)
compares `req.hostname` against `config.customDomain`. When set, the public
endpoints only respond to matching hosts. When unset, public endpoints
respond to all hosts — so existing deployments without custom domains
continue working unchanged.
