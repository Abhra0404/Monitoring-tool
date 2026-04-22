// ── Incidents route module ──
// CRUD + state machine (investigating → identified → monitoring → resolved).
// Every transition appends an IncidentUpdate and emits a timeline event.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { IncidentStatus, IncidentSeverity } from "../../shared/types.js";
import { emitEvent } from "../events/service.js";

const VALID_STATUSES: IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

const VALID_SEVERITIES: IncidentSeverity[] = [
  "minor",
  "major",
  "critical",
  "maintenance",
];

// Legal transitions (can always jump backwards to investigating or forward
// through the chain; resolving is always allowed from any state).
const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  investigating: ["identified", "monitoring", "resolved"],
  identified: ["investigating", "monitoring", "resolved"],
  monitoring: ["investigating", "identified", "resolved"],
  resolved: ["investigating"], // re-open only back to "investigating"
};

const createSchema = {
  body: {
    type: "object" as const,
    required: ["title", "message"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 255 },
      message: { type: "string", minLength: 1, maxLength: 5000 },
      status: { type: "string", enum: VALID_STATUSES },
      severity: { type: "string", enum: VALID_SEVERITIES },
      services: { type: "array", items: { type: "string" }, maxItems: 100 },
    },
  },
};

const addUpdateSchema = {
  body: {
    type: "object" as const,
    required: ["message"],
    properties: {
      status: { type: "string", enum: VALID_STATUSES },
      message: { type: "string", minLength: 1, maxLength: 5000 },
    },
  },
};

export default async function incidentsRoutes(app: FastifyInstance): Promise<void> {
  // ── Public active-incidents feed — rendered on the public status page.
  app.get("/public/active", async () => {
    const config = app.store.StatusPageConfig.getAny();
    if (!config || !config.isPublic) return { items: [] };
    const incidents = app.store.Incidents.find(config.userId, { limit: 50 })
      .filter((i) => i.status !== "resolved");
    return {
      items: incidents.map((i) => ({
        id: i._id,
        title: i.title,
        status: i.status,
        severity: i.severity,
        services: i.services,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        updates: app.store.IncidentUpdates.findByIncident(i._id),
      })),
    };
  });

  // All other routes require auth.
  app.register(async (scoped) => {
    scoped.addHook("preHandler", app.authenticate);

    scoped.get("/", async (req: FastifyRequest) => {
      const userId = req.user._id;
      const items = app.store.Incidents.find(userId);
      return items.map((i) => ({
        ...i,
        updates: app.store.IncidentUpdates.findByIncident(i._id),
      }));
    });

    scoped.get<{ Params: { id: string } }>(
      "/:id",
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const incident = app.store.Incidents.findById(req.params.id);
        if (!incident || incident.userId !== req.user._id) {
          return reply.status(404).send({ error: "Incident not found" });
        }
        return {
          ...incident,
          updates: app.store.IncidentUpdates.findByIncident(incident._id),
        };
      },
    );

    scoped.post(
      "/",
      { schema: createSchema },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const body = req.body as {
          title: string;
          message: string;
          status?: IncidentStatus;
          severity?: IncidentSeverity;
          services?: string[];
        };
        const status = body.status ?? "investigating";
        const incident = app.store.Incidents.create({
          userId: req.user._id,
          title: body.title,
          status,
          severity: body.severity,
          services: body.services,
        });
        app.store.IncidentUpdates.create({
          incidentId: incident._id,
          status,
          message: body.message,
        });
        emitEvent(app.store, app.io, {
          userId: req.user._id,
          kind: "incident_created",
          source: "incidents",
          severity: severityToEventSeverity(incident.severity),
          title: `Incident opened: ${incident.title}`,
          detail: { incidentId: incident._id, status, severity: incident.severity },
        });
        app.io?.to("all").emit("incident:created", incident);
        return reply.status(201).send({
          ...incident,
          updates: app.store.IncidentUpdates.findByIncident(incident._id),
        });
      },
    );

    scoped.post<{ Params: { id: string } }>(
      "/:id/updates",
      { schema: addUpdateSchema },
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const incident = app.store.Incidents.findById(req.params.id);
        if (!incident || incident.userId !== req.user._id) {
          return reply.status(404).send({ error: "Incident not found" });
        }
        const body = req.body as { status?: IncidentStatus; message: string };
        const newStatus = body.status ?? incident.status;
        if (
          newStatus !== incident.status &&
          !TRANSITIONS[incident.status].includes(newStatus)
        ) {
          return reply
            .status(400)
            .send({ error: `Illegal transition: ${incident.status} → ${newStatus}` });
        }

        const update = app.store.IncidentUpdates.create({
          incidentId: incident._id,
          status: newStatus,
          message: body.message,
        });
        if (newStatus !== incident.status) {
          app.store.Incidents.update(incident._id, req.user._id, { status: newStatus });
        } else {
          app.store.Incidents.update(incident._id, req.user._id, {});
        }
        const refreshed = app.store.Incidents.findById(incident._id);
        const isResolution = newStatus === "resolved" && incident.status !== "resolved";
        emitEvent(app.store, app.io, {
          userId: req.user._id,
          kind: isResolution ? "incident_resolved" : "incident_updated",
          source: "incidents",
          severity: isResolution ? "info" : severityToEventSeverity(incident.severity),
          title: isResolution
            ? `Incident resolved: ${incident.title}`
            : `Incident update: ${incident.title}`,
          detail: {
            incidentId: incident._id,
            status: newStatus,
            previousStatus: incident.status,
          },
        });
        app.io?.to("all").emit("incident:updated", { incident: refreshed, update });
        return {
          ...refreshed,
          updates: app.store.IncidentUpdates.findByIncident(incident._id),
        };
      },
    );

    scoped.put<{ Params: { id: string } }>(
      "/:id",
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const incident = app.store.Incidents.findById(req.params.id);
        if (!incident || incident.userId !== req.user._id) {
          return reply.status(404).send({ error: "Incident not found" });
        }
        const body = req.body as {
          title?: string;
          severity?: IncidentSeverity;
          services?: string[];
        };
        if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
          return reply.status(400).send({ error: "Invalid severity" });
        }
        const updated = app.store.Incidents.update(incident._id, req.user._id, {
          title: body.title,
          severity: body.severity,
          services: body.services,
        });
        return {
          ...updated,
          updates: app.store.IncidentUpdates.findByIncident(incident._id),
        };
      },
    );

    scoped.delete<{ Params: { id: string } }>(
      "/:id",
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const incident = app.store.Incidents.findById(req.params.id);
        if (!incident || incident.userId !== req.user._id) {
          return reply.status(404).send({ error: "Incident not found" });
        }
        app.store.Incidents.delete(incident._id, req.user._id);
        return reply.status(204).send();
      },
    );
  });
}

function severityToEventSeverity(
  sev: IncidentSeverity,
): "info" | "warning" | "error" | "critical" {
  switch (sev) {
    case "minor":
      return "warning";
    case "major":
      return "error";
    case "critical":
      return "critical";
    case "maintenance":
    default:
      return "info";
  }
}
