/**
 * Notification dispatch service.
 * Sends alerts and pipeline failure notifications to configured channels.
 * Supports: Slack, Email, Discord, Telegram, Generic Webhook.
 */

import https from "https";
import http from "http";
import { URL } from "url";
import type { Store } from "../../store/index.js";

let nodemailer: typeof import("nodemailer") | null = null;
try {
  nodemailer = await import("nodemailer");
} catch {
  // nodemailer is optional
}

// ── Provider: Slack ──
function sendSlack(webhookUrl: string, payload: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST" as const,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(opts, (res) => {
      let data = "";
      res.on("error", reject);
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Slack returned ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Slack timeout")));
    req.write(body);
    req.end();
  });
}

// ── Provider: Discord ──
function sendDiscord(webhookUrl: string, payload: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST" as const,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(opts, (res) => {
      let data = "";
      res.on("error", reject);
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Discord returned ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Discord timeout")));
    req.write(body);
    req.end();
  });
}

// ── Provider: Telegram ──
function sendTelegram(botToken: string, chatId: string, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
    const opts = {
      hostname: "api.telegram.org",
      path: `/bot${botToken}/sendMessage`,
      method: "POST" as const,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("error", reject);
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Telegram returned ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Telegram timeout")));
    req.write(body);
    req.end();
  });
}

// ── Provider: Microsoft Teams (Incoming Webhook / Adaptive Card) ──
function sendTeams(webhookUrl: string, card: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(card);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST" as const,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("error", reject);
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`Teams returned ${res.statusCode}: ${data}`));
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Teams timeout")));
    req.write(body);
    req.end();
  });
}

// ── Provider: PagerDuty Events API v2 ──
function sendPagerDuty(routingKey: string, event: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ routing_key: routingKey, ...event });
    const req = https.request(
      {
        hostname: "events.pagerduty.com",
        path: "/v2/enqueue",
        method: "POST" as const,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("error", reject);
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          // PagerDuty returns 202 Accepted on success.
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`PagerDuty returned ${res.statusCode}: ${data}`));
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("PagerDuty timeout")));
    req.write(body);
    req.end();
  });
}

// ── Provider: Generic Webhook ──
function sendWebhook(url: string, payload: Record<string, unknown>, method = "POST"): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const mod = parsed.protocol === "https:" ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const req = mod.request(opts, (res) => {
      let data = "";
      res.on("error", reject);
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Webhook returned ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Webhook timeout")));
    req.write(body);
    req.end();
  });
}

// ── Payload builders ──

function buildSlackAlertPayload(alert: Record<string, unknown>, type: string) {
  const isResolved = type === "resolved";
  const color = isResolved ? "#34d399" : alert.severity === "critical" ? "#ef4444" : "#f59e0b";
  const emoji = isResolved ? ":white_check_mark:" : ":rotating_light:";
  const title = isResolved ? `Resolved: ${alert.ruleName || alert.message}` : `Alert: ${alert.ruleName}`;

  return {
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${emoji} ${title}`, emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Metric:* ${alert.metricName || "N/A"}` },
          { type: "mrkdwn", text: `*Severity:* ${alert.severity || "info"}` },
          { type: "mrkdwn", text: `*Value:* ${alert.actualValue ?? "N/A"}` },
          { type: "mrkdwn", text: `*Threshold:* ${alert.threshold ?? "N/A"}` },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `Theoria • ${new Date().toISOString()}` }] },
    ],
  };
}

function buildDiscordAlertPayload(alert: Record<string, unknown>, type: string) {
  const isResolved = type === "resolved";
  const color = isResolved ? 0x34d399 : alert.severity === "critical" ? 0xef4444 : 0xf59e0b;
  const title = isResolved ? `Resolved: ${alert.ruleName || alert.message}` : `Alert: ${alert.ruleName}`;
  return {
    embeds: [{
      title,
      color,
      fields: [
        { name: "Metric", value: String(alert.metricName || "N/A"), inline: true },
        { name: "Severity", value: String(alert.severity || "info"), inline: true },
        { name: "Value", value: String(alert.actualValue ?? "N/A"), inline: true },
        { name: "Threshold", value: String(alert.threshold ?? "N/A"), inline: true },
      ],
      footer: { text: `Theoria • ${new Date().toISOString()}` },
    }],
  };
}

function buildTelegramAlertText(alert: Record<string, unknown>, type: string): string {
  const isResolved = type === "resolved";
  const emoji = isResolved ? "✅" : "🚨";
  const title = isResolved ? `Resolved: ${alert.ruleName || alert.message}` : `Alert: ${alert.ruleName}`;
  return `${emoji} <b>${title}</b>\n\nMetric: ${alert.metricName || "N/A"}\nSeverity: ${alert.severity || "info"}\nValue: ${alert.actualValue ?? "N/A"}\nThreshold: ${alert.threshold ?? "N/A"}\n\n<i>Theoria • ${new Date().toISOString()}</i>`;
}

function buildWebhookAlertPayload(alert: Record<string, unknown>, type: string) {
  return {
    event: type === "resolved" ? "alert.resolved" : "alert.fired",
    alert: {
      ruleName: alert.ruleName,
      metricName: alert.metricName,
      severity: alert.severity,
      actualValue: alert.actualValue,
      threshold: alert.threshold,
      message: alert.message,
    },
    timestamp: new Date().toISOString(),
  };
}

function buildTeamsAlertPayload(alert: Record<string, unknown>, type: string) {
  const isResolved = type === "resolved";
  const title = isResolved ? `Resolved: ${alert.ruleName || alert.message}` : `Alert: ${alert.ruleName}`;
  const color = isResolved ? "Good" : alert.severity === "critical" ? "Attention" : "Warning";
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          { type: "TextBlock", size: "Large", weight: "Bolder", text: title, color, wrap: true },
          { type: "FactSet", facts: [
            { title: "Metric", value: String(alert.metricName ?? "N/A") },
            { title: "Severity", value: String(alert.severity ?? "info") },
            { title: "Value", value: String(alert.actualValue ?? "N/A") },
            { title: "Threshold", value: String(alert.threshold ?? "N/A") },
          ] },
          { type: "TextBlock", text: `Theoria • ${new Date().toISOString()}`, isSubtle: true, size: "Small", wrap: true },
        ],
      },
    }],
  };
}

function buildPagerDutyAlertEvent(alert: Record<string, unknown>, type: string, dedupKey: string) {
  const action = type === "resolved" ? "resolve" : "trigger";
  const sev = (alert.severity as string) === "critical" ? "critical"
    : (alert.severity as string) === "warning" ? "warning"
    : (alert.severity as string) === "error" ? "error" : "info";
  return {
    event_action: action,
    dedup_key: dedupKey,
    payload: {
      summary: `${alert.ruleName ?? alert.message ?? "Theoria alert"}`,
      source: "theoria",
      severity: sev,
      custom_details: {
        metricName: alert.metricName,
        actualValue: alert.actualValue,
        threshold: alert.threshold,
        labels: alert.labels,
      },
    },
  };
}

function buildAlertEmailHtml(alert: Record<string, unknown>, type: string): string {
  const isResolved = type === "resolved";
  const color = isResolved ? "#34d399" : alert.severity === "critical" ? "#ef4444" : "#f59e0b";
  const title = isResolved ? `Resolved: ${alert.ruleName || alert.message}` : `Alert: ${alert.ruleName}`;
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:${color};color:white;padding:16px 20px;border-radius:8px 8px 0 0;"><h2 style="margin:0;font-size:18px;">${title}</h2></div><div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px 0;color:#6b7280;">Metric</td><td style="padding:8px 0;">${alert.metricName || "N/A"}</td></tr><tr><td style="padding:8px 0;color:#6b7280;">Severity</td><td style="padding:8px 0;">${alert.severity || "info"}</td></tr><tr><td style="padding:8px 0;color:#6b7280;">Value</td><td style="padding:8px 0;">${alert.actualValue ?? "N/A"}</td></tr><tr><td style="padding:8px 0;color:#6b7280;">Threshold</td><td style="padding:8px 0;">${alert.threshold ?? "N/A"}</td></tr></table><p style="color:#9ca3af;font-size:12px;margin-top:16px;">Theoria • ${new Date().toISOString()}</p></div></div>`;
}

function buildSlackPipelinePayload(pipeline: Record<string, unknown>) {
  return {
    blocks: [
      { type: "header", text: { type: "plain_text", text: `:x: Pipeline Failed: ${pipeline.pipelineName}`, emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Repo:* ${pipeline.repo}` },
          { type: "mrkdwn", text: `*Branch:* ${pipeline.branch || "N/A"}` },
          { type: "mrkdwn", text: `*Source:* ${pipeline.source}` },
          { type: "mrkdwn", text: `*Triggered by:* ${pipeline.triggeredBy || "N/A"}` },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `Theoria • ${new Date().toISOString()}` }] },
    ],
  };
}

// ── Email sender ──
async function sendEmail(config: Record<string, unknown>, subject: string, html: string): Promise<void> {
  if (!nodemailer) {
    throw new Error("nodemailer is not installed — run: npm install nodemailer");
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost as string,
    port: Number(config.smtpPort) || 587,
    secure: Number(config.smtpPort) === 465,
    auth: config.smtpUser ? { user: config.smtpUser as string, pass: config.smtpPass as string } : undefined,
  });
  await transporter.sendMail({
    from: (config.from as string) || `Theoria <${(config.smtpUser as string) || "noreply@theoria.local"}>`,
    to: config.to as string,
    subject,
    html,
  });
}

// ── Dispatch functions ──

export async function dispatchAlert(
  store: Store,
  userId: string,
  alert: Record<string, unknown>,
  type: "fired" | "resolved",
): Promise<void> {
  const channels = store.NotificationChannels.findActive(userId);
  if (channels.length === 0) return;

  for (const channel of channels) {
    try {
      const cfg = channel.config as Record<string, string>;
      switch (channel.type) {
        case "slack":
          await sendSlack(cfg.webhookUrl, buildSlackAlertPayload(alert, type));
          break;
        case "email":
          await sendEmail(
            channel.config,
            type === "resolved"
              ? `[Resolved] ${alert.ruleName || alert.message}`
              : `[${((alert.severity as string) || "alert").toUpperCase()}] ${alert.ruleName}`,
            buildAlertEmailHtml(alert, type),
          );
          break;
        case "discord":
          await sendDiscord(cfg.webhookUrl, buildDiscordAlertPayload(alert, type));
          break;
        case "telegram":
          await sendTelegram(cfg.botToken, cfg.chatId, buildTelegramAlertText(alert, type));
          break;
        case "webhook":
          await sendWebhook(cfg.url, buildWebhookAlertPayload(alert, type), cfg.method || "POST");
          break;
        case "teams":
          await sendTeams(cfg.webhookUrl, buildTeamsAlertPayload(alert, type));
          break;
        case "pagerduty": {
          const dedup = `${(alert.ruleName ?? "alert")}-${(alert.metricName ?? "")}`.slice(0, 255);
          await sendPagerDuty(cfg.routingKey, buildPagerDutyAlertEvent(alert, type, dedup));
          break;
        }
      }
    } catch (err: unknown) {
      console.error(`Notification failed (${channel.type}/${channel.name}):`, (err as Error).message);
    }
  }
}

export async function dispatchPipelineFailure(
  store: Store,
  userId: string,
  pipeline: Record<string, unknown>,
): Promise<void> {
  const channels = store.NotificationChannels.findActive(userId);
  if (channels.length === 0) return;

  for (const channel of channels) {
    try {
      const cfg = channel.config as Record<string, string>;
      switch (channel.type) {
        case "slack":
          await sendSlack(cfg.webhookUrl, buildSlackPipelinePayload(pipeline));
          break;
        case "discord":
          await sendDiscord(cfg.webhookUrl, {
            embeds: [{ title: `Pipeline Failed: ${pipeline.pipelineName}`, color: 0xef4444, fields: [
              { name: "Repo", value: String(pipeline.repo), inline: true },
              { name: "Branch", value: String(pipeline.branch || "N/A"), inline: true },
              { name: "Source", value: String(pipeline.source), inline: true },
            ] }],
          });
          break;
        case "webhook":
          await sendWebhook(cfg.url, { event: "pipeline.failed", pipeline, timestamp: new Date().toISOString() }, cfg.method || "POST");
          break;
      }
    } catch (err: unknown) {
      console.error(`Pipeline notification failed (${channel.type}/${channel.name}):`, (err as Error).message);
    }
  }
}

export async function testChannel(channel: { type: string; config: Record<string, unknown> }): Promise<void> {
  const testAlert = {
    ruleName: "Test Notification",
    metricName: "test_metric",
    severity: "info",
    actualValue: 42,
    threshold: 50,
    message: "This is a test notification from Theoria",
  };

  const cfg = channel.config as Record<string, string>;
  switch (channel.type) {
    case "slack":
      await sendSlack(cfg.webhookUrl, buildSlackAlertPayload(testAlert, "fired"));
      break;
    case "email":
      await sendEmail(channel.config, "[TEST] Theoria Notification Test", buildAlertEmailHtml(testAlert, "fired"));
      break;
    case "discord":
      await sendDiscord(cfg.webhookUrl, buildDiscordAlertPayload(testAlert, "fired"));
      break;
    case "telegram":
      await sendTelegram(cfg.botToken, cfg.chatId, buildTelegramAlertText(testAlert, "fired"));
      break;
    case "webhook":
      await sendWebhook(cfg.url, buildWebhookAlertPayload(testAlert, "fired"), cfg.method || "POST");
      break;
    case "teams":
      await sendTeams(cfg.webhookUrl, buildTeamsAlertPayload(testAlert, "fired"));
      break;
    case "pagerduty":
      await sendPagerDuty(cfg.routingKey, buildPagerDutyAlertEvent(testAlert, "fired", "theoria-test"));
      break;
    default:
      throw new Error(`Unknown notification channel type: ${channel.type}`);
  }
}
