import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Cpu, MemoryStick, Activity, AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import Sidebar from "../components/Sidebar";
import useSocket from "../hooks/useSocket";
import {
  fetchAlertRule,
  fetchServerMetrics,
  fetchServers,
  updateAlertRule,
} from "../services/api";
import { useAuth } from "../context/AuthContext";

function Dashboard() {
  const navigate = useNavigate();
  const { serverId: serverIdFromRoute } = useParams();
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [timeRange, setTimeRange] = useState("5m");
  const [historicalData, setHistoricalData] = useState([]);
  const [cpuThreshold, setCpuThreshold] = useState(80);
  const [memoryThreshold, setMemoryThreshold] = useState(90);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { logout, user } = useAuth();

  const alertRules = useMemo(
    () => ({ cpuThreshold, memoryThreshold }),
    [cpuThreshold, memoryThreshold]
  );
  const { liveData, alerts, resetStream } = useSocket(selectedServerId, alertRules);

  useEffect(() => {
    let isMounted = true;

    fetchServers()
      .then((serverList) => {
        if (!isMounted) {
          return;
        }

        setServers(serverList);
        if (serverList.length > 0) {
          const initialServerId = serverIdFromRoute || serverList[0].serverId;
          setSelectedServerId(initialServerId);
          navigate(`/servers/${initialServerId}`, { replace: true });
        }
        setLoading(false);
      })
      .catch(() => {
        if (isMounted) {
          setServers([]);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, serverIdFromRoute]);

  useEffect(() => {
    if (serverIdFromRoute && serverIdFromRoute !== selectedServerId) {
      setSelectedServerId(serverIdFromRoute);
      resetStream();
    }
  }, [serverIdFromRoute, selectedServerId, resetStream]);

  useEffect(() => {
    if (!selectedServerId) {
      setHistoricalData([]);
      return;
    }

    let isMounted = true;
    setHistoryLoading(true);

    fetchServerMetrics(selectedServerId, timeRange)
      .then((metrics) => {
        if (!isMounted) return;
        setHistoricalData(metrics);
      })
      .catch(() => {
        if (isMounted) {
          setHistoricalData([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setHistoryLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedServerId, timeRange]);

  useEffect(() => {
    if (!selectedServerId) {
      return;
    }

    let isMounted = true;
    setRulesLoading(true);

    fetchAlertRule(selectedServerId)
      .then((rule) => {
        if (!isMounted) return;
        setCpuThreshold(rule.cpuThreshold ?? 80);
        setMemoryThreshold(rule.memoryThreshold ?? 90);
      })
      .finally(() => {
        if (isMounted) {
          setRulesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedServerId]);

  useEffect(() => {
    if (alerts.length > 0) {
      toast.error(alerts[0].message, { toastId: alerts[0].message });
    }
  }, [alerts]);

  const selectedServer = useMemo(
    () => servers.find((server) => server.serverId === selectedServerId),
    [servers, selectedServerId]
  );

  const data = useMemo(() => {
    const merged = [...historicalData, ...liveData];
    const byTimestamp = new Map();

    merged.forEach((item) => {
      const ts =
        item.timestamp ||
        (item.time ? new Date(item.time).getTime() : Date.now());

      byTimestamp.set(ts, {
        ...item,
        timestamp: ts,
      });
    });

    return Array.from(byTimestamp.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-300)
      .map((item) => ({
        ...item,
        time: new Date(item.timestamp).toLocaleTimeString(),
      }));
  }, [historicalData, liveData]);

  const latest = data[data.length - 1] || {};

  const cpuPercent = Math.min(100, (latest.cpu || 0) * 10);
  const memoryUsed = latest.totalMem
    ? ((latest.totalMem - latest.freeMem) / latest.totalMem) * 100
    : 0;

  const healthScore = Math.floor(
    (Math.max(0, 100 - cpuPercent) + Math.max(0, 100 - memoryUsed)) / 2
  );

  const healthColor =
    healthScore > 75
      ? "text-green-400"
      : healthScore > 40
      ? "text-yellow-400"
      : "text-red-400";

  const formattedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        memoryPercent: item.totalMem
          ? ((item.totalMem - item.freeMem) / item.totalMem) * 100
          : 0,
        cpuPercent: Math.min(100, (item.cpu || 0) * 10),
      })),
    [data]
  );

  const handleServerSelect = (serverId) => {
    setSelectedServerId(serverId);
    navigate(`/servers/${serverId}`);
    resetStream();
  };

  const handleSaveAlertRules = async () => {
    if (!selectedServerId) return;

    setSavingRules(true);
    try {
      const savedRule = await updateAlertRule(selectedServerId, {
        cpuThreshold,
        memoryThreshold,
      });
      setCpuThreshold(savedRule.cpuThreshold);
      setMemoryThreshold(savedRule.memoryThreshold);
      toast.success("Alert rules saved");
    } catch {
      toast.error("Failed to save alert rules");
    } finally {
      setSavingRules(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0B0F17] text-white">
      <Sidebar
        servers={servers}
        selectedServerId={selectedServerId}
        onSelectServer={handleServerSelect}
      />

      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading servers...</p>
            </div>
          </div>
        ) : servers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-yellow-400" />
              <h3 className="text-xl font-semibold mb-2">No Servers Found</h3>
              <p className="text-gray-400 mb-4">
                Make sure the agent is running and sending metrics to the server.
              </p>
              <p className="text-sm text-gray-500">
                Start the agent with: <code className="bg-gray-800 px-2 py-1 rounded">npm start</code> in the agent directory
              </p>
            </div>
          </div>
        ) : (
          <>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">
            {selectedServer?.name || selectedServerId || "Loading..."}
          </h2>

          <div className="flex items-center gap-4">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-[#111827] border border-[#1F2937] rounded-xl px-3 py-2 text-sm"
            >
              <option value="5m">Last 5 min</option>
              <option value="1h">Last 1 hour</option>
              <option value="24h">Last 24 hours</option>
            </select>

            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm text-gray-400">Live</span>
            </div>

            <div className="bg-[#111827] px-4 py-2 rounded-xl border border-[#1F2937] shadow-[0_0_20px_rgba(0,255,198,0.1)]">
              Health: <span className={healthColor}>{healthScore}</span>
            </div>

            <button
              type="button"
              onClick={logout}
              className="bg-[#111827] px-4 py-2 rounded-xl border border-[#1F2937] text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="bg-[#111827] p-4 rounded-xl border border-[#1F2937] mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Alert Rules</h3>
            <span className="text-xs text-gray-400">{user?.email}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="text-gray-400">CPU Threshold (%)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={cpuThreshold}
                onChange={(e) => setCpuThreshold(Number(e.target.value) || 1)}
                className="mt-1 w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-lg"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-400">Memory Threshold (%)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={memoryThreshold}
                onChange={(e) => setMemoryThreshold(Number(e.target.value) || 1)}
                className="mt-1 w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-lg"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSaveAlertRules}
              disabled={rulesLoading || savingRules}
              className="bg-green-400 hover:bg-green-500 text-[#0B0F17] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {rulesLoading ? "Loading..." : savingRules ? "Saving..." : "Save Rules"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard
            title="CPU"
            value={`${cpuPercent.toFixed(1)}%`}
            icon={<Cpu />}
          />
          <MetricCard
            title="Memory"
            value={`${memoryUsed.toFixed(1)}%`}
            icon={<MemoryStick />}
          />
          <MetricCard
            title="Uptime"
            value={formatTime(latest.uptime)}
            icon={<Activity />}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <ChartCard title="CPU Usage">
            <LineChart data={formattedData}>
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="cpuPercent"
                stroke="#00FFC6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartCard>

          <ChartCard title="Memory Usage">
            <LineChart data={formattedData}>
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="memoryPercent"
                stroke="#FACC15"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartCard>
        </div>

        {historyLoading && (
          <p className="text-sm text-gray-400 mb-4">Loading historical metrics...</p>
        )}

        <div className="bg-[#111827] p-4 rounded-xl border border-[#1F2937] shadow-[0_0_20px_rgba(239,68,68,0.1)]">
          <h3 className="mb-4 flex items-center gap-2">
            <AlertTriangle size={18} /> Alerts
          </h3>

          {alerts.length === 0 ? (
            <p className="text-gray-400">No alerts</p>
          ) : (
            alerts.map((alert, index) => (
              <div key={index} className="text-red-400 text-sm mb-2">
                {`Alert: ${alert.message}`}
              </div>
            ))
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(sec) {
  if (!sec) {
    return "--";
  }

  return `${Math.floor(sec / 60)} min`;
}

export default Dashboard;
