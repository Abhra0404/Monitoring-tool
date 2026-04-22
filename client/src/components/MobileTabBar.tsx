import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Bell, AlertTriangle, Activity, Globe } from "lucide-react";

/**
 * Mobile-only bottom tab bar. Appears at <768px and gives thumb-reachable
 * navigation for the core surfaces while the hamburger/sidebar is hidden.
 */
function MobileTabBar() {
  const location = useLocation();
  const tabs: Array<{ path: string; label: string; Icon: React.ComponentType<{ size?: number }> }> = [
    { path: "/",           label: "Home",      Icon: LayoutDashboard },
    { path: "/timeline",   label: "Timeline",  Icon: Activity },
    { path: "/incidents",  label: "Incidents", Icon: AlertTriangle },
    { path: "/alerts",     label: "Alerts",    Icon: Bell },
    { path: "/http-checks", label: "Checks",   Icon: Globe },
  ];
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#0d1117] border-t border-gray-800 flex justify-around pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-lg"
      aria-label="Primary"
    >
      {tabs.map(({ path, label, Icon }) => {
        const active = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center justify-center text-[10px] px-3 py-1 min-w-[44px] min-h-[44px] ${
              active ? "text-emerald-400" : "text-gray-500"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={18} />
            <span className="mt-0.5">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileTabBar;
