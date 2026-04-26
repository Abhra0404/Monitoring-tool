# Installing the Agent

You can run the agent four ways. Pick the one that matches your platform.

| Method | Best for |
|---|---|
| `npx theoria-cli agent` | Quick tests, CI runners, environments with Node already installed |
| `install.sh` (systemd) | Long-lived Linux servers |
| `install.ps1` (Windows Service) | Long-lived Windows servers |
| `com.theoria.agent.plist` (launchd) | macOS hosts |
| Docker | Container-orchestrated environments |
| Kubernetes DaemonSet | Per-node monitoring on a cluster |

In every case you'll need:

1. The Theoria server URL (`https://monitor.example.com` or `http://10.0.0.5:4000`)
2. An API key — copy it from **Settings → API Keys** in the dashboard

---

## npx (Node already installed)

```bash
npx theoria-cli agent \
  --url https://monitor.example.com \
  --key <API_KEY> \
  --id $(hostname)
```

Add `--docker` to also collect container metrics. This will run in the foreground; pair with `nohup`, `tmux`, or your favourite supervisor for production.

---

## Linux (systemd)

```bash
curl -fsSL https://get.theoria.io/agent.sh | \
  sudo sh -s -- \
    --url https://monitor.example.com \
    --key <API_KEY>
```

What the installer does:

1. Downloads the architecture-appropriate static binary into `/usr/local/bin/theoria-agent` (mode `0755`).
2. Writes an environment file to `/etc/theoria-agent.env` (mode `0600`, owner root).
3. Installs a hardened systemd unit at `/etc/systemd/system/theoria-agent.service` with:
   - `DynamicUser=yes`
   - `ProtectSystem=strict`, `ProtectHome=yes`
   - `NoNewPrivileges=true`, `PrivateTmp=yes`
   - `MemoryMax=128M`, `CPUQuota=10%`
4. `systemctl daemon-reload && systemctl enable --now theoria-agent`.

Verify:

```bash
systemctl status theoria-agent
journalctl -u theoria-agent -f
```

To uninstall: `sudo systemctl disable --now theoria-agent && sudo rm /etc/systemd/system/theoria-agent.service /etc/theoria-agent.env /usr/local/bin/theoria-agent`.

---

## macOS (launchd)

```bash
curl -fsSL https://get.theoria.io/agent.sh | \
  sudo sh -s -- \
    --url https://monitor.example.com \
    --key <API_KEY>
```

The same installer detects Darwin and instead installs:

- `/usr/local/bin/theoria-agent`
- `/Library/LaunchDaemons/com.theoria.agent.plist` (rendered from the template, owned by `_theoria-agent`)

Load it with `sudo launchctl bootstrap system /Library/LaunchDaemons/com.theoria.agent.plist`. Logs go to `/var/log/theoria-agent.log`.

---

## Windows (Service)

```powershell
iwr https://get.theoria.io/agent.ps1 -useb | iex
Install-TheoriaAgent `
  -Url 'https://monitor.example.com' `
  -Key '<API_KEY>'
```

This installs a Windows Service named `TheoriaAgent` running as `NT AUTHORITY\LocalService`, startup type *Automatic (Delayed)*. It uses native `sc.exe` — no NSSM or third-party wrappers.

Inspect with:

```powershell
Get-Service TheoriaAgent
Get-WinEvent -LogName Application -Source TheoriaAgent -MaxEvents 50
```

---

## Docker

```bash
docker run -d \
  --name theoria-agent \
  --restart unless-stopped \
  --pid=host \
  --network=host \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e API_URL=https://monitor.example.com \
  -e API_KEY=<API_KEY> \
  -e SERVER_ID=$(hostname) \
  -e DOCKER=true \
  ghcr.io/theoria-monitoring/agent:latest
```

`--pid=host` and `--network=host` are required for accurate host-level metrics; otherwise the agent will report container-scoped figures. The Docker socket mount is required only when `DOCKER=true`.

---

## Kubernetes DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: theoria-agent
  namespace: observability
spec:
  selector:
    matchLabels:
      app: theoria-agent
  template:
    metadata:
      labels:
        app: theoria-agent
    spec:
      hostPID: true
      hostNetwork: true
      tolerations:
        - operator: Exists
      containers:
        - name: agent
          image: ghcr.io/theoria-monitoring/agent:latest
          env:
            - name: API_URL
              value: https://monitor.example.com
            - name: API_KEY
              valueFrom:
                secretKeyRef: { name: theoria-agent, key: api-key }
            - name: SERVER_ID
              valueFrom:
                fieldRef: { fieldPath: spec.nodeName }
          resources:
            limits:    { cpu: 100m, memory: 64Mi }
            requests:  { cpu: 10m,  memory: 32Mi }
          volumeMounts:
            - { name: docker-sock, mountPath: /var/run/docker.sock, readOnly: true }
      volumes:
        - name: docker-sock
          hostPath: { path: /var/run/docker.sock }
```

Apply with `kubectl apply -f agent-daemonset.yaml`. The agent appears once per node, identified by `spec.nodeName`.

---

## Verifying the install

After 10 – 15 seconds the host should appear under **Servers → Overview** with live charts. If it does not:

```bash
# Check connectivity from the agent host
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <API_KEY>" \
  https://monitor.example.com/health
```

A `401` means the key is wrong. A `404` or connection error means the URL is wrong. See [Troubleshooting](../troubleshooting.md).
