// ── Notification channel routes module ──

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { testChannel as testChannelService } from "./service.js";

const SUPPORTED_TYPES = ["slack", "email", "discord", "telegram", "webhook", "teams", "pagerduty"];

// Fields whose values are credentials and must never be returned to a
// dashboard caller. Slack/Discord webhook URLs *are* the credential, as
// is a PagerDuty routingKey or Telegram botToken (round-2 audit #13).
const SECRET_CONFIG_FIELDS = [
  "smtpPass",
  "botToken",
  "webhookUrl",
  "routingKey",
  "apiKey",
  "url", // generic-webhook
] as const;

function maskConfig(config: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const masked: Record<string, unknown> = { ...(config ?? {}) };
  for (const k of SECRET_CONFIG_FIELDS) {
    if (typeof masked[k] === "string" && (masked[k] as string).length > 0) {
      masked[k] = "••••••••";
    }
  }
  return masked;
}

export default async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // GET /api/notifications/channels
  app.get("/channels", async (req: FastifyRequest) => {
    const channels = app.store.NotificationChannels.find(req.user._id);
    return channels.map((c) => ({ ...c, config: maskConfig(c.config as Record<string, unknown>) }));
  });

  // POST /api/notifications/channels
  app.post("/channels", async (req: FastifyRequest, reply: FastifyReply) => {
    const { type, name, config } = req.body as { type?: string; name?: string; config?: Record<string, unknown> };
    if (!type || !name || !config) {
      return reply.status(400).send({ error: "type, name, and config are required" });
    }
    if (!SUPPORTED_TYPES.includes(type)) {
      return reply.status(400).send({ error: `type must be one of: ${SUPPORTED_TYPES.join(", ")}` });
    }
    if (type === "slack" && !config.webhookUrl) {
      return reply.status(400).send({ error: "webhookUrl is required for Slack channels" });
    }
    if (type === "email" && (!config.smtpHost || !config.to)) {
      return reply.status(400).send({ error: "smtpHost and to are required for email channels" });
    }
    if (type === "discord" && !config.webhookUrl) {
      return reply.status(400).send({ error: "webhookUrl is required for Discord channels" });
    }
    if (type === "telegram" && (!config.botToken || !config.chatId)) {
      return reply.status(400).send({ error: "botToken and chatId are required for Telegram channels" });
    }
    if (type === "webhook" && !config.url) {
      return reply.status(400).send({ error: "url is required for webhook channels" });
    }
    if (type === "teams" && !config.webhookUrl) {
      return reply.status(400).send({ error: "webhookUrl is required for Teams channels" });
    }
    if (type === "pagerduty" && !config.routingKey) {
      return reply.status(400).send({ error: "routingKey is required for PagerDuty channels" });
    }

    const channel = app.store.NotificationChannels.create({
      userId: req.user._id,
      type,
      name: name.trim(),
      config,
    });
    return reply.status(201).send({ ...channel, config: maskConfig(channel.config as Record<string, unknown>) });
  });

  // PUT /api/notifications/channels/:channelId
  app.put("/channels/:channelId", async (req: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
    const channel = app.store.NotificationChannels.findById(req.params.channelId);
    if (!channel || channel.userId !== req.user._id) {
      return reply.status(404).send({ error: "Notification channel not found" });
    }
    const { name, config } = req.body as { name?: string; config?: Record<string, unknown> };
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name.trim();
    if (config) {
      // Preserve existing secret values if the dashboard re-sent the
      // bullet-mask placeholder (which means the operator did not edit
      // that field).
      const existing = (channel.config ?? {}) as Record<string, unknown>;
      const incoming = config as Record<string, unknown>;
      for (const k of SECRET_CONFIG_FIELDS) {
        if (incoming[k] === "••••••••" && typeof existing[k] === "string") {
          incoming[k] = existing[k];
        }
      }
      updates.config = incoming;
    }
    const updated = app.store.NotificationChannels.update(req.params.channelId, updates);
    return updated ? { ...updated, config: maskConfig(updated.config as Record<string, unknown>) } : updated;
  });

  // DELETE /api/notifications/channels/:channelId
  app.delete("/channels/:channelId", async (req: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
    const removed = app.store.NotificationChannels.delete(req.params.channelId, req.user._id);
    if (!removed) return reply.status(404).send({ error: "Notification channel not found" });
    return { success: true };
  });

  // PATCH /api/notifications/channels/:channelId/toggle
  app.patch("/channels/:channelId/toggle", async (req: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
    const channel = app.store.NotificationChannels.toggleActive(req.params.channelId, req.user._id);
    if (!channel) return reply.status(404).send({ error: "Notification channel not found" });
    return channel;
  });

  // POST /api/notifications/channels/:channelId/test
  app.post("/channels/:channelId/test", async (req: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
    const channel = app.store.NotificationChannels.findById(req.params.channelId);
    if (!channel || channel.userId !== req.user._id) {
      return reply.status(404).send({ error: "Notification channel not found" });
    }
    try {
      await testChannelService(channel);
      return { success: true, message: "Test notification sent" };
    } catch (err: unknown) {
      return reply.status(500).send({ error: (err as Error).message || "Failed to send test notification" });
    }
  });
}
