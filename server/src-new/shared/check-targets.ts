// ── Synthetic-check target validation ──
//
// Synthetic checks (HTTP, TCP, Ping, DNS) accept user-supplied URLs/hosts
// and the server initiates outbound connections to them. Without
// validation, an authenticated user can probe internal services they
// could not otherwise reach (the cloud metadata endpoint, intra-VPC
// services, the Theoria server itself, etc.) — classic SSRF.
//
// We block:
//   * Loopback        (127.0.0.0/8, ::1, "localhost")
//   * Link-local      (169.254.0.0/16 — incl. AWS/GCP/Azure metadata,
//                      fe80::/10)
//   * RFC1918 private (10/8, 172.16/12, 192.168/16)
//   * Unique-local v6 (fc00::/7)
//   * Non-routable / reserved ranges (0.0.0.0, multicast, broadcast)
//
// To monitor private-network targets on purpose, set
//   THEORIA_ALLOW_INTERNAL_TARGETS=true
// (cluster operator opts in for the whole instance).
//
// Caveat: this is a hostname-shape check. A hostname that resolves to a
// blocked IP at probe time (DNS rebinding) is still defended against by
// the runners themselves which call this validator with the resolved IP
// when applicable. Hostname lookup happens at scheduling AND each probe.

export class InvalidCheckTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCheckTargetError";
  }
}

function isAllowedByEnv(): boolean {
  const v = process.env.THEORIA_ALLOW_INTERNAL_TARGETS;
  return v === "true" || v === "1";
}

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [, a, b] = m.map(Number);
  if (a === 10) return true;                              // 10/8
  if (a === 127) return true;                             // loopback
  if (a === 169 && b === 254) return true;                // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16/12
  if (a === 192 && b === 168) return true;                // 192.168/16
  if (a === 0) return true;                               // 0.0.0.0/8
  if (a >= 224) return true;                              // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lc = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lc === "::1" || lc === "::") return true;           // loopback / unspecified
  if (lc.startsWith("fe80:") || lc.startsWith("fe80::")) return true;
  if (lc.startsWith("fc") || lc.startsWith("fd")) return true;
  if (lc.startsWith("ff")) return true;                   // multicast
  // IPv4-mapped IPv6: ::ffff:a.b.c.d
  const v4mapped = lc.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  // Cloud metadata services
  "metadata.google.internal",
  "metadata.azure.com",
]);

/**
 * Validate a hostname or IP against the SSRF blocklist. Pass IPv4/IPv6
 * literals or DNS names. Returns true when the target is allowed.
 */
export function isAllowedTargetHost(host: string): boolean {
  if (isAllowedByEnv()) return true;
  if (!host) return false;
  const h = host.trim().toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return false;
  if (h.includes(":") && !h.includes(".")) {
    // IPv6 literal (no embedded dots)
    return !isPrivateIPv6(h);
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return !isPrivateIPv4(h);
  }
  // DNS name: also reject anything ending in .internal / .local — these
  // are RFC 6762 mDNS / common private TLDs.
  if (h.endsWith(".internal") || h.endsWith(".local") || h.endsWith(".localhost")) {
    return false;
  }
  return true;
}

/**
 * Validate an HTTP/HTTPS URL and assert SSRF-safety. Throws
 * `InvalidCheckTargetError` on invalid URL, blocked scheme or blocked
 * host.
 */
export function assertAllowedHttpUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new InvalidCheckTargetError("Invalid URL format");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidCheckTargetError("Only http: and https: URLs are allowed");
  }
  if (!isAllowedTargetHost(parsed.hostname)) {
    throw new InvalidCheckTargetError(
      "Target host is on the internal/loopback blocklist. Set THEORIA_ALLOW_INTERNAL_TARGETS=true to allow.",
    );
  }
  return parsed;
}

/**
 * Validate a hostname target (TCP / Ping / DNS checks). Throws on
 * blocked targets.
 */
export function assertAllowedHost(host: string): void {
  if (!isAllowedTargetHost(host)) {
    throw new InvalidCheckTargetError(
      "Target host is on the internal/loopback blocklist. Set THEORIA_ALLOW_INTERNAL_TARGETS=true to allow.",
    );
  }
}
