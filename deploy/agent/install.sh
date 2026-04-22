#!/bin/sh
# Theoria agent installer — Linux (systemd) / macOS (launchd).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/theoria-monitoring/theoria/main/deploy/agent/install.sh | \
#     sh -s -- --url https://monitor.example.com --key <API_KEY> [--id hostname]
#
# Or with an onboarding token:
#   curl -fsSL … | sh -s -- --token <JWT>
#
# Environment fallbacks: THEORIA_URL, THEORIA_KEY, THEORIA_ID, THEORIA_TOKEN.
#
# Exits non-zero on any failure. Idempotent — re-running upgrades the binary
# and rewrites the service unit.

set -eu

REPO="${THEORIA_REPO:-theoria-monitoring/theoria}"
VERSION="${THEORIA_VERSION:-latest}"
INSTALL_DIR="${THEORIA_INSTALL_DIR:-/usr/local/bin}"
ENV_FILE="${THEORIA_ENV_FILE:-/etc/theoria-agent.env}"
DOCKER="${THEORIA_DOCKER:-0}"

URL=""
KEY=""
ID=""
TOKEN=""

# ─── argv parsing ──────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --url)     URL="$2";   shift 2 ;;
    --key)     KEY="$2";   shift 2 ;;
    --id)      ID="$2";    shift 2 ;;
    --token)   TOKEN="$2"; shift 2 ;;
    --docker)  DOCKER=1;   shift   ;;
    -h|--help)
      sed -n '3,15p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

URL="${URL:-${THEORIA_URL:-}}"
KEY="${KEY:-${THEORIA_KEY:-}}"
ID="${ID:-${THEORIA_ID:-$(hostname)}}"
TOKEN="${TOKEN:-${THEORIA_TOKEN:-}}"

# ─── OS / arch detection ───────────────────────────────────────────────────
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in
  x86_64|amd64) arch="amd64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac
case "$os" in
  linux|darwin) ;;
  *) echo "Unsupported OS: $os — use install.ps1 on Windows" >&2; exit 1 ;;
esac

# ─── token → url/key/id via onboarding endpoint ────────────────────────────
if [ -n "$TOKEN" ]; then
  # Decode the token's payload claim-by-claim (base64url). POSIX sh doesn't
  # ship a JSON parser, so we keep this to sed/tr manipulation that works on
  # BusyBox as well as GNU.
  payload_b64=$(printf '%s' "$TOKEN" | cut -d. -f2)
  pad=$(( (4 - ${#payload_b64} % 4) % 4 ))
  while [ "$pad" -gt 0 ]; do payload_b64="${payload_b64}="; pad=$((pad-1)); done
  payload=$(printf '%s' "$payload_b64" | tr '_-' '/+' | base64 -d 2>/dev/null || true)
  if [ -z "$payload" ]; then
    echo "Invalid onboarding token (could not decode)" >&2
    exit 1
  fi
  token_url=$(printf '%s' "$payload" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
  URL="${URL:-$token_url}"
  if [ -z "$URL" ]; then
    echo "Onboarding token missing \"url\" claim" >&2
    exit 1
  fi
  echo "→ Exchanging onboarding token at $URL/api/auth/onboarding/verify"
  resp=$(curl -fsSL -X POST \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}" \
    "$URL/api/auth/onboarding/verify")
  KEY=$(printf '%s' "$resp" | sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p')
  token_id=$(printf '%s' "$resp" | sed -n 's/.*"serverId":"\([^"]*\)".*/\1/p')
  [ -n "$token_id" ] && ID="$token_id"
fi

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Missing --url or --key (or --token)" >&2
  exit 1
fi

# ─── download binary ───────────────────────────────────────────────────────
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

binary="theoria-agent-${os}-${arch}"
if [ "$VERSION" = "latest" ]; then
  download_url="https://github.com/${REPO}/releases/latest/download/${binary}"
else
  download_url="https://github.com/${REPO}/releases/download/${VERSION}/${binary}"
fi
echo "→ Downloading $download_url"
curl -fsSL -o "$tmp/theoria-agent" "$download_url"
chmod +x "$tmp/theoria-agent"

# ─── install ───────────────────────────────────────────────────────────────
sudo=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo="sudo"
  else
    echo "This installer needs root (or sudo)" >&2
    exit 1
  fi
fi

$sudo install -m 0755 "$tmp/theoria-agent" "$INSTALL_DIR/theoria-agent"
echo "→ Installed $INSTALL_DIR/theoria-agent"

# ─── service unit ──────────────────────────────────────────────────────────
if [ "$os" = "linux" ]; then
  umask 077
  $sudo sh -c "cat > '$ENV_FILE' <<EOF
THEORIA_URL=$URL
THEORIA_KEY=$KEY
THEORIA_ID=$ID
THEORIA_DOCKER=$DOCKER
EOF"
  $sudo chmod 0600 "$ENV_FILE"
  echo "→ Wrote $ENV_FILE (mode 0600)"

  unit=/etc/systemd/system/theoria-agent.service
  # Prefer shipping our hardened unit from the release tarball if present.
  if [ -f "$(dirname "$0")/theoria-agent.service" ]; then
    $sudo install -m 0644 "$(dirname "$0")/theoria-agent.service" "$unit"
  else
    $sudo curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/deploy/agent/theoria-agent.service" -o "$unit"
  fi
  $sudo systemctl daemon-reload
  $sudo systemctl enable --now theoria-agent.service
  echo "✓ theoria-agent running (systemctl status theoria-agent)"
elif [ "$os" = "darwin" ]; then
  plist=/Library/LaunchDaemons/com.theoria.agent.plist
  if [ -f "$(dirname "$0")/com.theoria.agent.plist" ]; then
    template="$(dirname "$0")/com.theoria.agent.plist"
  else
    template=$(mktemp)
    curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/deploy/agent/com.theoria.agent.plist" -o "$template"
  fi
  $sudo sh -c "sed \
    -e 's|@@URL@@|$URL|' \
    -e 's|@@KEY@@|$KEY|' \
    -e 's|@@ID@@|$ID|' \
    -e 's|@@DOCKER@@|$DOCKER|' \
    '$template' > '$plist'"
  $sudo chmod 0644 "$plist"
  $sudo chown root:wheel "$plist"
  # launchctl exits 113 if already loaded — treat as idempotent reload.
  $sudo launchctl bootout system "$plist" 2>/dev/null || true
  $sudo launchctl bootstrap system "$plist"
  $sudo launchctl enable system/com.theoria.agent
  echo "✓ theoria-agent running (launchctl print system/com.theoria.agent)"
fi
