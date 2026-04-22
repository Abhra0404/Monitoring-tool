import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";
import ServerDetail from "./pages/ServerDetail";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import HttpChecks from "./pages/HttpChecks";
import TcpChecks from "./pages/TcpChecks";
import PingChecks from "./pages/PingChecks";
import DnsChecks from "./pages/DnsChecks";
import Heartbeats from "./pages/Heartbeats";
import Pipelines from "./pages/Pipelines";
import NotificationSettings from "./pages/NotificationSettings";
import DockerContainers from "./pages/DockerContainers";
import StatusPage from "./pages/StatusPage";
import Timeline from "./pages/Timeline";
import Incidents from "./pages/Incidents";
import Topology from "./pages/Topology";
import Plugins from "./pages/Plugins";
import CommandPalette from "./components/CommandPalette";
import MobileTabBar from "./components/MobileTabBar";
import useSocket from "./hooks/useSocket";
import { fetchServers, fetchActiveAlertCount } from "./services/api";
import type { ServerRecord, MetricSnapshot, HttpCheckResult, Pipeline, DockerContainer } from "./types";

function AppShell() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [alertCount, setAlertCount] = useState(0);

  const {
    liveData, alerts, connected, allServerMetrics,
    httpCheckResults, tcpCheckResults, pingCheckResults, dnsCheckResults,
    heartbeatEvents, pipelineUpdates, dockerMetrics,
    events, anomalies, incidents, pluginResults,
    resetStream,
  } = useSocket(selectedServerId);

  // Load servers + alert count on mount and every 15 s
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [list, count] = await Promise.all([fetchServers(), fetchActiveAlertCount()]);
        if (!mounted) return;
        setServers(list);
        setAlertCount(count);
      } catch {
        // network errors are non-fatal
      }
    };
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Keep alert badge count in sync with live socket events
  useEffect(() => {
    setAlertCount(alerts.filter((a) => a.status !== "resolved").length);
  }, [alerts]);

  const handleSelectServer = useCallback((serverId: string) => {
    setSelectedServerId(serverId);
    navigate(`/servers/${serverId}`);
    resetStream();
  }, [navigate, resetStream]);

  return (
    <div className="flex h-screen bg-[#010409] text-gray-100">
      <Sidebar
        servers={servers}
        selectedServerId={selectedServerId}
        onSelectServer={handleSelectServer}
        alertCount={alertCount}
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6">
        <Routes>
          <Route path="/" element={<Overview allServerMetrics={allServerMetrics} connected={connected} />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/http-checks" element={<HttpChecks httpCheckResults={httpCheckResults} />} />
          <Route path="/tcp-checks" element={<TcpChecks tcpCheckResults={tcpCheckResults} />} />
          <Route path="/ping-checks" element={<PingChecks pingCheckResults={pingCheckResults} />} />
          <Route path="/dns-checks" element={<DnsChecks dnsCheckResults={dnsCheckResults} />} />
          <Route path="/heartbeats" element={<Heartbeats heartbeatEvents={heartbeatEvents} />} />
          <Route path="/pipelines" element={<Pipelines pipelineUpdates={pipelineUpdates} />} />
          <Route path="/docker" element={<DockerContainers dockerMetrics={dockerMetrics} />} />
          <Route path="/notifications" element={<NotificationSettings />} />
          <Route path="/status-page" element={<StatusPage />} />
          <Route path="/plugins" element={<Plugins pluginResults={pluginResults} />} />
          <Route path="/timeline" element={<Timeline liveEvents={events} />} />
          <Route path="/incidents" element={<Incidents liveIncidents={incidents} />} />
          <Route
            path="/servers/:serverId"
            element={<ServerDetail liveData={liveData} connected={connected} resetStream={resetStream} anomalies={anomalies} />}
          />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <MobileTabBar />
      <CommandPalette servers={servers} onSelectServer={handleSelectServer} />
    </div>
  );
}

// Re-export prop types for page components to import
export type { MetricSnapshot, HttpCheckResult, Pipeline, DockerContainer };
export default AppShell;
