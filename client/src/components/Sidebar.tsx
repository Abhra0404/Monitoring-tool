import { useLocation, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Server, Bell, BellRing, Settings,
  Globe, Globe2, GitBranch, Box, LogOut,
  Network, Radio, Heart, Activity, AlertTriangle,
  Share2, Plug,
} from "lucide-react";
import type { ServerRecord } from "../types";
import useAuthStore from "../stores/authStore";
import { logout as apiLogout } from "../services/api";
import ThemeToggle from "./ThemeToggle";

interface NavItem {
  path: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/",             icon: LayoutDashboard, label: "Overview"      },
  { path: "/topology",     icon: Share2,          label: "Topology"      },
  { path: "/http-checks",  icon: Globe,           label: "HTTP Checks"   },
  { path: "/tcp-checks",   icon: Network,         label: "TCP Checks"    },
  { path: "/ping-checks",  icon: Radio,           label: "Ping Checks"   },
  { path: "/dns-checks",   icon: Globe2,          label: "DNS Checks"    },
  { path: "/heartbeats",   icon: Heart,           label: "Heartbeats"    },
  { path: "/pipelines",    icon: GitBranch,        label: "Pipelines"     },
  { path: "/docker",       icon: Box,             label: "Docker"        },
  { path: "/alerts",       icon: Bell,            label: "Alerts"        },
  { path: "/incidents",    icon: AlertTriangle,   label: "Incidents"     },
  { path: "/timeline",     icon: Activity,        label: "Timeline"      },
  { path: "/notifications",icon: BellRing,        label: "Notifications" },
  { path: "/status-page",  icon: Globe2,          label: "Status Page"   },
  { path: "/plugins",      icon: Plug,            label: "Plugins"       },
  { path: "/settings",     icon: Settings,        label: "Settings"      },
];

interface SidebarProps {
  servers?: ServerRecord[];
  selectedServerId?: string;
  onSelectServer: (serverId: string) => void;
  alertCount?: number;
}

function statusColor(status: string): string {
  if (status === "online") return "bg-emerald-400";
  if (status === "warning") return "bg-amber-400";
  return "bg-red-400";
}

function statusPulse(status: string): string {
  return status === "online" ? "animate-pulse" : "";
}

function Sidebar({ servers = [], selectedServerId = "", onSelectServer, alertCount = 0 }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  async function handleLogout() {
    await apiLogout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="hidden md:flex w-64 bg-[#0d1117] border-r border-gray-800 flex-col h-screen">
      {/* Brand */}
      <div className="p-5 border-b border-gray-800">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-emerald-400 text-2xl font-bold leading-none" aria-hidden="true">Θ</span>
          <span className="text-xl font-bold tracking-tight">Theoria</span>
        </Link>
        <p className="text-[11px] text-gray-500 mt-1">System Monitoring</p>
      </div>

      {/* Navigation */}
      <nav className="px-3 pt-4">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">Navigation</p>
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
                  <span className="truncate flex-1">{server.name ?? server.serverId}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor(server.status)} ${statusPulse(server.status)}`} />
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
      <div className="p-3 border-t border-gray-800 space-y-2">
        {user && (
          <div className="px-3 py-1 text-xs text-gray-400 truncate" title={user.email}>
            {user.email}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
