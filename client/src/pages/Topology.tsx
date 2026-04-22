import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, MarkerType,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import PageHeader from "../components/PageHeader";
import {
  fetchServers, fetchHttpChecks, fetchTcpChecks, fetchPingChecks,
  fetchDnsChecks, fetchHeartbeats,
} from "../services/api";
import type {
  ServerRecord, HttpCheck, TcpCheck, PingCheck, DnsCheck, HeartbeatMonitor,
} from "../types";

interface NodeData extends Record<string, unknown> {
  label: string;
  detail?: string;
  kind: "server" | "http" | "tcp" | "ping" | "dns" | "heartbeat";
  status: "up" | "down" | "warning" | "unknown";
}

function nodeColor(status: NodeData["status"]): { border: string; bg: string } {
  switch (status) {
    case "up":      return { border: "#34d399", bg: "rgba(52,211,153,0.10)" };
    case "warning": return { border: "#f59e0b", bg: "rgba(245,158,11,0.10)" };
    case "down":    return { border: "#ef4444", bg: "rgba(239,68,68,0.10)" };
    default:        return { border: "#6b7280", bg: "rgba(107,114,128,0.08)" };
  }
}

function Topology() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [httpChecks, setHttpChecks] = useState<HttpCheck[]>([]);
  const [tcpChecks, setTcpChecks] = useState<TcpCheck[]>([]);
  const [pingChecks, setPingChecks] = useState<PingCheck[]>([]);
  const [dnsChecks, setDnsChecks] = useState<DnsCheck[]>([]);
  const [heartbeats, setHeartbeats] = useState<HeartbeatMonitor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [s, h, t, p, d, hb] = await Promise.all([
          fetchServers(),
          fetchHttpChecks().catch(() => []),
          fetchTcpChecks().catch(() => []),
          fetchPingChecks().catch(() => []),
          fetchDnsChecks().catch(() => []),
          fetchHeartbeats().catch(() => []),
        ]);
        if (!mounted) return;
        setServers(s);
        setHttpChecks(h);
        setTcpChecks(t);
        setPingChecks(p);
        setDnsChecks(d);
        setHeartbeats(hb);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const { nodes, edges } = useMemo<{ nodes: Node<NodeData>[]; edges: Edge[] }>(() => {
    const ns: Node<NodeData>[] = [];
    const es: Edge[] = [];

    // Root: the Theoria server itself
    const rootId = "theoria-core";
    ns.push({
      id: rootId,
      type: "default",
      position: { x: 0, y: 0 },
      data: { label: "Theoria Core", detail: "dashboard + ingest", kind: "server", status: "up" },
      style: {
        background: "rgba(52,211,153,0.18)",
        border: "2px solid #34d399",
        color: "#fff",
        borderRadius: 12,
        padding: 12,
        fontSize: 12,
        width: 180,
      },
    });

    // Servers — row 1
    const serverY = -220;
    servers.forEach((s, i) => {
      const status: NodeData["status"] =
        s.status === "online" ? "up" : s.status === "warning" ? "warning" : "down";
      const c = nodeColor(status);
      const id = `server:${s.serverId}`;
      ns.push({
        id,
        position: { x: (i - servers.length / 2) * 220, y: serverY },
        data: {
          label: s.name ?? s.serverId,
          detail: `${s.platform ?? "?"} · ${s.arch ?? ""}`,
          kind: "server",
          status,
        },
        style: {
          background: c.bg,
          border: `2px solid ${c.border}`,
          color: "#fff",
          borderRadius: 10,
          padding: 10,
          fontSize: 11,
          width: 170,
        },
      });
      es.push({
        id: `e-core-${id}`,
        source: rootId,
        target: id,
        animated: status === "up",
        style: { stroke: c.border },
        markerEnd: { type: MarkerType.ArrowClosed, color: c.border },
      });
    });

    // Helper to drop a stack of checks on one side of the canvas
    function stack(
      kind: NodeData["kind"],
      items: Array<{ id: string; label: string; detail?: string; status: NodeData["status"] }>,
      baseX: number,
      baseY: number,
    ) {
      items.forEach((it, i) => {
        const c = nodeColor(it.status);
        const id = `${kind}:${it.id}`;
        ns.push({
          id,
          position: { x: baseX, y: baseY + i * 75 },
          data: { label: it.label, detail: it.detail, kind, status: it.status },
          style: {
            background: c.bg,
            border: `1.5px solid ${c.border}`,
            color: "#fff",
            borderRadius: 8,
            padding: 8,
            fontSize: 10,
            width: 200,
          },
        });
        es.push({
          id: `e-core-${id}`,
          source: rootId,
          target: id,
          style: { stroke: c.border, strokeWidth: 1, opacity: 0.6 },
        });
      });
    }

    const httpItems = httpChecks.map((c) => ({
      id: c._id,
      label: c.name,
      detail: c.url,
      status: (c.status === "up" ? "up" : c.status === "down" ? "down" : "unknown") as NodeData["status"],
    }));
    const tcpItems = tcpChecks.map((c) => ({
      id: c._id,
      label: c.name,
      detail: `${c.host}:${c.port}`,
      status: (c.status === "up" ? "up" : c.status === "down" ? "down" : "unknown") as NodeData["status"],
    }));
    const pingItems = pingChecks.map((c) => ({
      id: c._id,
      label: c.name,
      detail: c.host,
      status: (c.status === "up" ? "up" : c.status === "down" ? "down" : "unknown") as NodeData["status"],
    }));
    const dnsItems = dnsChecks.map((c) => ({
      id: c._id,
      label: c.name,
      detail: `${c.recordType} ${c.domain}`,
      status: (c.status === "up" ? "up" : c.status === "down" ? "down" : "unknown") as NodeData["status"],
    }));
    const heartbeatItems = heartbeats.map((m) => ({
      id: m._id,
      label: m.name,
      detail: `every ${m.expectedEverySeconds}s`,
      status: (m.status === "up" ? "up" : m.status === "down" ? "down" : "unknown") as NodeData["status"],
    }));

    stack("http", httpItems, -640, 80);
    stack("tcp", tcpItems, -400, 80);
    stack("ping", pingItems, 260, 80);
    stack("dns", dnsItems, 480, 80);
    stack("heartbeat", heartbeatItems, 700, 80);

    return { nodes: ns, edges: es };
  }, [servers, httpChecks, tcpChecks, pingChecks, dnsChecks, heartbeats]);

  const upCount = nodes.filter((n) => n.data.status === "up").length;
  const downCount = nodes.filter((n) => n.data.status === "down").length;

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Topology"
        subtitle={`Live service graph · ${upCount} healthy · ${downCount} down`}
      />
      <div className="flex-1 bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden" style={{ minHeight: 560 }}>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            panOnScroll
          >
            <Background gap={24} color="#1f2937" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(1,4,9,0.8)"
              nodeColor={(n) => nodeColor((n.data as NodeData).status).border}
              style={{ background: "#0d1117", border: "1px solid #1f2937" }}
            />
          </ReactFlow>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        Nodes auto-refresh every 30 seconds. Click-drag to rearrange, scroll to zoom. Colour indicates current status.
      </p>
    </div>
  );
}

export default Topology;
