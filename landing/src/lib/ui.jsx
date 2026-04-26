import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Shared layout & primitive components.
 */

export function Section({ id, children, className = "", as: As = "section" }) {
  return (
    <As id={id} className={`relative px-5 sm:px-6 lg:px-8 ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </As>
  );
}

export function Eyebrow({ children, className = "" }) {
  return (
    <div className={`eyebrow flex items-center gap-2 ${className}`}>
      <span className="h-px w-6 bg-stroke-1 inline-block" />
      <span>{children}</span>
      <span className="h-px w-6 flex-1 bg-stroke-1 inline-block" />
    </div>
  );
}

export function SectionHead({ eyebrow, title, kicker, align = "left" }) {
  const alignCls = align === "center" ? "text-center items-center" : "text-left items-start";
  return (
    <div className={`flex flex-col ${alignCls} max-w-2xl ${align === "center" ? "mx-auto" : ""}`}>
      {eyebrow && <Eyebrow className="mb-5">{eyebrow}</Eyebrow>}
      <h2 className="heading-section text-fg">{title}</h2>
      {kicker && <p className="mt-4 text-fg-1 text-base sm:text-lg leading-relaxed">{kicker}</p>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy", className = "" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  };
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border border-stroke-1 bg-surface-2/60 px-2 py-1 text-xs font-medium text-fg-2 hover:text-fg hover:border-stroke-2 transition-colors ${className}`}
    >
      {copied ? <Check size={12} className="text-brand" /> : <Copy size={12} />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

export function GitHubIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function ThetaMark({ size = 22 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-[#06251a] font-bold leading-none"
      style={{ width: size, height: size, fontSize: size * 0.7 }}
    >
      Θ
    </span>
  );
}

export function StatusDot({ tone = "ok" }) {
  if (tone === "ok") {
    return <span className="signal" aria-label="operational" />;
  }
  if (tone === "warn") {
    return <span className="inline-block w-2 h-2 rounded-full bg-warn" aria-label="degraded" />;
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-alert" aria-label="incident" />;
}
