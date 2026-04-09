import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Server,
  Bell,
  Settings,
  Activity,
  LogOut,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { path: "/", icon: LayoutDashboard, label: "Overview" },
  { path: "/alerts", icon: Bell, label: "Alerts" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

function Sidebar({ servers = [], selectedServerId, onSelectServer, alertCount = 0 }) {
  const location = useLocation();
  const { logout } = useAuth();

  const statusColor = (status) => {
    if (status === "online") return "bg-emerald-400";
    if (status === "warning") return "bg-amber-400";
    return "bg-red-400";
  };

  const statusPulse = (status) => {
    if (status === "online") return "animate-pulse";
    return "";
  };

  return (
    <aside className="w-64 bg-[#0d1117] border-r border-gray-800 flex flex-col h-screen">
      {/* Brand */}
      <div className="p-5 border-b border-gray-800">
        <Link to="/" className="flex items-center gap-2">
          <Activity className="text-emerald-400" size={24} />
          <span className="text-xl font-bold tracking-tight">
            Monitor<span className="text-emerald-400">X</span>
          </span>
        </Link>
        <p className="text-[11px] text-gray-500 mt-1">System Monitoring</p>
      </div>

      {/* Navigation */}
      <nav className="px-3 pt-4">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
          Navigation
        </p>
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-all ${
                isActive
                  ? "bg-emerald-400/10 text-emerald-400"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
              {label === "Alerts" && alertCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Servers List */}
      <div className="flex-1 overflow-y-auto px-3 pt-4">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
          Servers ({servers.length})
        </p>
        <div className="space-y-0.5">
          {servers.map((server) => {
            const isSelected = selectedServerId === server.serverId;
            return (
              <button
                key={server.serverId}
                type="button"
                onClick={() => onSelectServer(server.serverId)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                  isSelected
                    ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Server size={14} className="shrink-0" />
                  <span className="truncate flex-1">
                    {server.name || server.serverId}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${statusColor(server.status)} ${statusPulse(server.status)}`}
                  />
                </div>
                {isSelected && server.platform && (
                  <p className="text-[10px] text-gray-500 mt-1 ml-5">
                    {server.platform} · {server.arch}
                  </p>
                )}
              </button>
            );
          })}
          {servers.length === 0 && (
            <p className="text-xs text-gray-600 px-3 py-2">No servers connected</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800">
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
