import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Server, Bell, BellRing, Settings, Globe, Globe2,
  GitBranch, Box, Network, Radio, Heart, Activity, AlertTriangle,
  Share2, Moon, Sun, LogOut, Plug,
} from "lucide-react";
import type { ServerRecord } from "../types";
import useThemeStore from "../stores/themeStore";
import useAuthStore from "../stores/authStore";
import { logout as apiLogout } from "../services/api";

interface CommandPaletteProps {
  servers: ServerRecord[];
  onSelectServer: (serverId: string) => void;
}

const PAGES: Array<{ path: string; label: string; Icon: React.ComponentType<{ size?: number }> }> = [
  { path: "/",              label: "Overview",            Icon: LayoutDashboard },
  { path: "/topology",      label: "Topology Map",        Icon: Share2 },
  { path: "/http-checks",   label: "HTTP Checks",         Icon: Globe },
  { path: "/tcp-checks",    label: "TCP Checks",          Icon: Network },
  { path: "/ping-checks",   label: "Ping Checks",         Icon: Radio },
  { path: "/dns-checks",    label: "DNS Checks",          Icon: Globe2 },
  { path: "/heartbeats",    label: "Heartbeats",          Icon: Heart },
  { path: "/pipelines",     label: "Pipelines",           Icon: GitBranch },
  { path: "/docker",        label: "Docker Containers",   Icon: Box },
  { path: "/alerts",        label: "Alerts",              Icon: Bell },
  { path: "/incidents",     label: "Incidents",           Icon: AlertTriangle },
  { path: "/timeline",      label: "Timeline",            Icon: Activity },
  { path: "/notifications", label: "Notification Channels", Icon: BellRing },
  { path: "/status-page",   label: "Status Page",         Icon: Globe2 },
  { path: "/plugins",       label: "Plugins",             Icon: Plug },
  { path: "/settings",      label: "Settings",            Icon: Settings },
];

function CommandPalette({ servers, onSelectServer }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const authed = useAuthStore((s) => s.getAccessToken());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function run(fn: () => void) {
    setOpen(false);
    setSearch("");
    fn();
  }

  if (!authed) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="bg-[#0d1117] border border-gray-800 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
          >
            <Command
              label="Command palette"
              shouldFilter
              className="flex flex-col"
            >
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder="Type a command or search for a server…"
                className="w-full bg-transparent border-b border-gray-800 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none"
              />
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-gray-500">
                  No results.
                </Command.Empty>

                <Command.Group
                  heading="Navigation"
                  className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5"
                >
                  {PAGES.map(({ path, label, Icon }) => (
                    <Command.Item
                      key={path}
                      value={`nav ${label}`}
                      onSelect={() => run(() => navigate(path))}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 aria-selected:bg-emerald-400/10 aria-selected:text-emerald-400 cursor-pointer"
                    >
                      <Icon size={15} />
                      <span>{label}</span>
                      <span className="ml-auto text-[10px] text-gray-500">Go to</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                {servers.length > 0 && (
                  <Command.Group
                    heading="Servers"
                    className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5 mt-2"
                  >
                    {servers.map((s) => (
                      <Command.Item
                        key={s.serverId}
                        value={`server ${s.name ?? s.serverId} ${s.platform ?? ""}`}
                        onSelect={() => run(() => onSelectServer(s.serverId))}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 aria-selected:bg-emerald-400/10 aria-selected:text-emerald-400 cursor-pointer"
                      >
                        <Server size={15} />
                        <span className="truncate">{s.name ?? s.serverId}</span>
                        <span className={
                          s.status === "online"
                            ? "ml-auto w-2 h-2 rounded-full bg-emerald-400"
                            : s.status === "warning"
                              ? "ml-auto w-2 h-2 rounded-full bg-amber-400"
                              : "ml-auto w-2 h-2 rounded-full bg-red-400"
                        } />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group
                  heading="Actions"
                  className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5 mt-2"
                >
                  <Command.Item
                    value="action toggle theme"
                    onSelect={() => run(toggleTheme)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 aria-selected:bg-emerald-400/10 aria-selected:text-emerald-400 cursor-pointer"
                  >
                    {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                    <span>Switch to {theme === "dark" ? "light" : "dark"} theme</span>
                  </Command.Item>
                  <Command.Item
                    value="action sign out logout"
                    onSelect={() => run(async () => {
                      await apiLogout();
                      window.location.href = "/login";
                    })}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 aria-selected:bg-emerald-400/10 aria-selected:text-emerald-400 cursor-pointer"
                  >
                    <LogOut size={15} />
                    <span>Sign out</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
              <div className="border-t border-gray-800 px-3 py-2 text-[10px] text-gray-500 flex items-center justify-between">
                <span>↑↓ to navigate · ↵ to select · esc to close</span>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">⌘ K</kbd>
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}

export default CommandPalette;
