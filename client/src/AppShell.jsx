import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";
import ServerDetail from "./pages/ServerDetail";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import HttpChecks from "./pages/HttpChecks";
import Pipelines from "./pages/Pipelines";
import NotificationSettings from "./pages/NotificationSettings";
import DockerContainers from "./pages/DockerContainers";
import StatusPage from "./pages/StatusPage";
import useSocket from "./hooks/useSocket";
import { fetchServers, fetchActiveAlertCount } from "./services/api";

function AppShell() {
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [alertCount, setAlertCount] = useState(0);

  const { liveData, alerts, connected, allServerMetrics, httpCheckResults, pipelineUpdates, dockerMetrics, resetStream } = useSocket(selectedServerId);

  // Load servers
  useEffect(() => {
    let m = true;
    const load = async () => {
      try {
        const [list, count] = await Promise.all([
          fetchServers(),
          fetchActiveAlertCount(),
        ]);
        if (!m) return;
        setServers(list);
        setAlertCount(count);
      } catch {}
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { m = false; clearInterval(interval); };
  }, []);

  // Track server-side alert count from socket
  useEffect(() => {
    const firingCount = alerts.filter((a) => a.status !== "resolved").length;
    setAlertCount(firingCount);
  }, [alerts]);

  const handleSelectServer = useCallback((serverId) => {
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
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route
            path="/"
            element={<Overview allServerMetrics={allServerMetrics} connected={connected} />}
          />
          <Route path="/http-checks" element={<HttpChecks httpCheckResults={httpCheckResults} />} />
          <Route path="/pipelines" element={<Pipelines pipelineUpdates={pipelineUpdates} />} />
          <Route path="/docker" element={<DockerContainers dockerMetrics={dockerMetrics} />} />
          <Route path="/notifications" element={<NotificationSettings />} />
          <Route path="/status-page" element={<StatusPage />} />
          <Route
            path="/servers/:serverId"
            element={
              <ServerDetail
                liveData={liveData}
                connected={connected}
                resetStream={resetStream}
              />
            }
          />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default AppShell;
