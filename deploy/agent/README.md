# Theoria Agent Deployment Assets

This folder ships everything an operator needs to install the Theoria Go
agent as a proper system service. Every asset is invoked by `install.sh` on
Linux/macOS or `install.ps1` on Windows — a human never has to touch the
unit / plist / service definitions directly.

| File | Platform | Purpose |
| --- | --- | --- |
| `install.sh` | Linux & macOS | Downloads the right binary from GitHub Releases, writes a secrets env file (mode `0600`), drops the service unit into place, and starts it. Idempotent. |
| `install.ps1` | Windows | Downloads `theoria-agent-windows-amd64.exe`, registers a Windows service named `TheoriaAgent` under `NT AUTHORITY\LocalService`, Automatic (Delayed) start. Uses `sc.exe` natively — no nssm required. |
| `theoria-agent.service` | Linux (systemd) | Hardened unit: `DynamicUser=yes`, `ProtectSystem=strict`, `NoNewPrivileges=yes`, memory ceiling 128 MB, 32-task cap. Reads config from `/etc/theoria-agent.env`. |
| `com.theoria.agent.plist` | macOS (launchd) | Template plist. The installer rewrites `@@URL@@ / @@KEY@@ / @@ID@@ / @@DOCKER@@` placeholders before dropping to `/Library/LaunchDaemons/`. Uses the unprivileged `_theoria-agent` account. |

## Quick start

### Linux

```sh
curl -fsSL https://raw.githubusercontent.com/theoria-monitoring/theoria/main/deploy/agent/install.sh | \
  sudo sh -s -- --url https://monitor.example.com --key <API_KEY>
```

Or with an onboarding token generated from the dashboard:

```sh
curl -fsSL …/install.sh | sudo sh -s -- --token eyJhbGciOi…
```

### macOS

Same `install.sh` — OS auto-detected. It drops the launchd plist at
`/Library/LaunchDaemons/com.theoria.agent.plist`, writes credentials into
the plist itself (so keychain integration is optional, not required), and
bootstraps the service.

### Windows (PowerShell, elevated)

```powershell
Invoke-WebRequest `
  -Uri https://raw.githubusercontent.com/theoria-monitoring/theoria/main/deploy/agent/install.ps1 `
  -UseBasicParsing | Invoke-Expression
Install-TheoriaAgent -Url 'https://monitor.example.com' -Key '<API_KEY>'
```

## Upgrade

Re-run `install.sh` / `install.ps1`. Both scripts overwrite the binary,
rewrite the service definition, and restart the daemon. The env file
(Linux) is only replaced when `--url` / `--key` / `--token` are passed on
the command line again — otherwise the existing credentials are preserved
by the service unit.

## Uninstall

### Linux

```sh
sudo systemctl disable --now theoria-agent
sudo rm -f /etc/systemd/system/theoria-agent.service /etc/theoria-agent.env /usr/local/bin/theoria-agent
sudo systemctl daemon-reload
```

### macOS

```sh
sudo launchctl bootout system /Library/LaunchDaemons/com.theoria.agent.plist
sudo rm -f /Library/LaunchDaemons/com.theoria.agent.plist /usr/local/bin/theoria-agent
```

### Windows

```powershell
Stop-Service TheoriaAgent
sc.exe delete TheoriaAgent
Remove-Item "$env:ProgramFiles\Theoria" -Recurse -Force
```

## Release artifacts

The agent Makefile emits five binaries into `agent/dist/` via `make build-all`:

- `theoria-agent-linux-amd64`
- `theoria-agent-linux-arm64`
- `theoria-agent-darwin-amd64`
- `theoria-agent-darwin-arm64`
- `theoria-agent-windows-amd64.exe`

`make checksums` appends `SHA256SUMS`. The `.github/workflows/release.yml`
GitHub Action invokes these targets on every tag and uploads the binaries
plus the three installer assets in this folder to the GitHub Release page.
