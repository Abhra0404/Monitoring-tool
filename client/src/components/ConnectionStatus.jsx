import { Wifi, WifiOff } from "lucide-react";

function ConnectionStatus({ connected }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${connected ? "text-emerald-400" : "text-red-400"}`}>
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      <span>{connected ? "Live" : "Disconnected"}</span>
      {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
    </div>
  );
}

export default ConnectionStatus;
