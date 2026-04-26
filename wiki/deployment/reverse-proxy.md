# Reverse Proxy

Run Theoria behind a reverse proxy that terminates TLS and forwards both HTTP and WebSocket traffic. This page covers Caddy (recommended) and Nginx.

## Caddy

Theoria ships a template at [`deploy/Caddyfile.template`](../../deploy/Caddyfile.template):

```caddy
monitor.example.com {
    encode gzip zstd

    # API + WebSocket — both go to the same upstream
    reverse_proxy theoria:4000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}

        # Long-lived WebSocket connections
        transport http {
            keepalive 30s
            keepalive_idle_conns 10
        }
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
    }

    # Caddy automatically obtains a Let's Encrypt cert for monitor.example.com
}
```

Caddy handles ACME automatically; no manual cert juggling.

## Nginx

```nginx
upstream theoria {
    server theoria:4000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name monitor.example.com;

    ssl_certificate     /etc/letsencrypt/live/monitor.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.example.com/privkey.pem;
    ssl_protocols       TLSv1.3 TLSv1.2;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # API + static + WebSocket
    location / {
        proxy_pass         http://theoria;
        proxy_http_version 1.1;

        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # WebSocket upgrade
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

server {
    listen 80;
    server_name monitor.example.com;
    return 301 https://$host$request_uri;
}
```

## Trusted proxies

Theoria respects `X-Forwarded-For` and `X-Forwarded-Proto` only when the immediate peer is in the trusted-proxy list:

```bash
TRUSTED_PROXIES="10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
```

This prevents header spoofing from arbitrary clients. In Kubernetes, set this to your ingress controller's CIDR.

## Authorization header

Both `/api/*` (JWT) and `/metrics` (API key) require an `Authorization` header. Most proxies forward all headers by default, but if you have explicit allowlists, ensure `Authorization` is included.

## CORS vs same-origin

If the dashboard is served from the same origin as the API (typical), no CORS configuration is needed. If you serve the dashboard from a different origin (e.g. CDN-hosted), set `CORS_ORIGINS` on the server:

```bash
CORS_ORIGINS="https://app.example.com,https://staging.example.com"
```

## WebSocket gotchas

- **Cloudflare:** turn off "Rocket Loader" for the dashboard hostname; it interferes with the React bundle.
- **AWS ALB:** set the idle timeout to ≥ 120 s; default 60 s drops Socket.IO connections during pinging.
- **Stickiness:** not required. The Redis adapter for Socket.IO broadcasts events across replicas, so any client can be served by any pod.

## Internal endpoints

If you expose `/internal/metrics` to your Prometheus scraper, restrict access at the proxy:

```nginx
location /internal/ {
    allow 10.0.0.0/8;       # cluster CIDR
    deny all;
    proxy_pass http://theoria;
    # …same proxy headers as above
}
```

…and require a bearer token via `INTERNAL_METRICS_TOKEN`.
