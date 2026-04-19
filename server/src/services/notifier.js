/**
 * Notification dispatch service.
 * Sends alerts and pipeline failure notifications to configured channels (Slack, Email).
 */

const https = require("https");
const http = require("http");
const { NotificationChannels } = require("../store");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  // nodemailer is optional — email won't work without it
}

// ── Slack ──────────────────────────────────────────────────────────────
function sendSlack(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const data = JSON.stringify(payload);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    };
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`Slack returned ${res.statusCode}: ${body}`));
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(new Error("Slack timeout")); });
    req.write(data);
    req.end();
  });
}

function buildSlackAlertPayload(alert, type) {
  const isResolved = type === "resolved";
  const color = isResolved ? "#34d399" : alert.severity === "critical" ? "#ef4444" : "#f59e0b";
  const emoji = isResolved ? ":white_check_mark:" : ":rotating_light:";
  const title = isResolved ? `Resolved: ${alert.ruleName || alert.message}` : `Alert: ${alert.ruleName}`;

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} ${title}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Metric:* ${alert.metricName || "N/A"}` },
          { type: "mrkdwn", text: `*Severity:* ${alert.severity || "info"}` },
          { type: "mrkdwn", text: `*Value:* ${alert.actualValue ?? "N/A"}` },
          { type: "mrkdwn", text: `*Threshold:* ${alert.threshold ?? "N/A"}` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Theoria • ${new Date().toISOString()}` },
        ],
      },
    ],
  };
}

function buildSlackPipelinePayload(pipeline) {
  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `:x: Pipeline Failed: ${pipeline.pipelineName}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Repo:* ${pipeline.repo}` },
          { type: "mrkdwn", text: `*Branch:* ${pipeline.branch || "N/A"}` },
          { type: "mrkdwn", text: `*Source:* ${pipeline.source}` },
          { type: "mrkdwn", text: `*Triggered by:* ${pipeline.triggeredBy || "N/A"}` },
        ],
      },
      ...(pipeline.commitMessage
        ? [{ type: "section", text: { type: "mrkdwn", text: `*Commit:* \`${pipeline.commitSha?.slice(0, 7)}\` ${pipeline.commitMessage}` } }]
        : []),
      ...(pipeline.url
        ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View Pipeline" }, url: pipeline.url }] }]
        : []),
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Theoria • ${new Date().toISOString()}` }],
      },
    ],
  };
}

// ── Email ──────────────────────────────────────────────────────────────
async function sendEmail(config, subject, html) {
  if (!nodemailer) {
    throw new Error("nodemailer is not installed — run: npm install nodemailer");
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort) || 587,
    secure: Number(config.smtpPort) === 465,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
  });
  await transporter.sendMail({
    from: config.from || `Theoria <${config.smtpUser || "noreply@theoria.local"}>`,
    to: config.to,
    subject,
    html,
  });
}

function buildAlertEmailHtml(alert, type) {
  const isResolved = type === "resolved";
  const color = isResolved ? "#34d399" : alert.severity === "critical" ? "#ef4444" : "#f59e0b";
  const title = isResolved ? `Resolved: ${alert.ruleName || alert.message}` : `Alert: ${alert.ruleName}`;

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${color};color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">${title}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#6b7280;">Metric</td><td style="padding:8px 0;">${alert.metricName || "N/A"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Severity</td><td style="padding:8px 0;">${alert.severity || "info"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Value</td><td style="padding:8px 0;">${alert.actualValue ?? "N/A"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Threshold</td><td style="padding:8px 0;">${alert.threshold ?? "N/A"}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Theoria • ${new Date().toISOString()}</p>
      </div>
    </div>
  `;
}

function buildPipelineEmailHtml(pipeline) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#ef4444;color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Pipeline Failed: ${pipeline.pipelineName}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#6b7280;">Repository</td><td style="padding:8px 0;">${pipeline.repo}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Branch</td><td style="padding:8px 0;">${pipeline.branch || "N/A"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Source</td><td style="padding:8px 0;">${pipeline.source}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Triggered by</td><td style="padding:8px 0;">${pipeline.triggeredBy || "N/A"}</td></tr>
          ${pipeline.commitMessage ? `<tr><td style="padding:8px 0;color:#6b7280;">Commit</td><td style="padding:8px 0;"><code>${pipeline.commitSha?.slice(0, 7)}</code> ${pipeline.commitMessage}</td></tr>` : ""}
        </table>
        ${pipeline.url ? `<a href="${pipeline.url}" style="display:inline-block;margin-top:16px;padding:8px 16px;background:#3b82f6;color:white;text-decoration:none;border-radius:6px;">View Pipeline</a>` : ""}
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Theoria • ${new Date().toISOString()}</p>
      </div>
    </div>
  `;
}

// ── Dispatch functions ─────────────────────────────────────────────────
async function dispatchAlert(userId, alert, type) {
  const channels = NotificationChannels.findActive(userId);
  if (channels.length === 0) return;

  for (const channel of channels) {
    try {
      if (channel.type === "slack") {
        const payload = buildSlackAlertPayload(alert, type);
        await sendSlack(channel.config.webhookUrl, payload);
      } else if (channel.type === "email") {
        const subject = type === "resolved"
          ? `[Resolved] ${alert.ruleName || alert.message}`
          : `[${(alert.severity || "alert").toUpperCase()}] ${alert.ruleName}`;
        const html = buildAlertEmailHtml(alert, type);
        await sendEmail(channel.config, subject, html);
      }
    } catch (err) {
      console.error(`Notification failed (${channel.type}/${channel.name}):`, err.message);
    }
  }
}

async function dispatchPipelineFailure(userId, pipeline) {
  const channels = NotificationChannels.findActive(userId);
  if (channels.length === 0) return;

  for (const channel of channels) {
    try {
      if (channel.type === "slack") {
        const payload = buildSlackPipelinePayload(pipeline);
        await sendSlack(channel.config.webhookUrl, payload);
      } else if (channel.type === "email") {
        const subject = `[PIPELINE FAILED] ${pipeline.pipelineName} — ${pipeline.repo}`;
        const html = buildPipelineEmailHtml(pipeline);
        await sendEmail(channel.config, subject, html);
      }
    } catch (err) {
      console.error(`Pipeline notification failed (${channel.type}/${channel.name}):`, err.message);
    }
  }
}

async function testChannel(channel) {
  const testAlert = {
    ruleName: "Test Notification",
    metricName: "test_metric",
    severity: "info",
    actualValue: 42,
    threshold: 50,
    message: "This is a test notification from Theoria",
  };

  if (channel.type === "slack") {
    const payload = buildSlackAlertPayload(testAlert, "fired");
    await sendSlack(channel.config.webhookUrl, payload);
  } else if (channel.type === "email") {
    await sendEmail(channel.config, "[TEST] Theoria Notification Test", buildAlertEmailHtml(testAlert, "fired"));
  }
}

module.exports = { dispatchAlert, dispatchPipelineFailure, testChannel };
