function Sidebar({ servers, selectedServerId, onSelectServer }) {
  const statusColor = (status) => {
    if (status === "online") return "bg-green-400";
    if (status === "warning") return "bg-yellow-400";
    return "bg-red-400";
  };

  return (
    <div className="w-60 bg-[#111827] p-5 border-r border-[#1F2937]">
      <h1 className="text-xl font-bold mb-6">MonitorX</h1>
      <p className="text-gray-400 mb-4">Servers</p>

      {servers.map((server) => (
        <button
          key={server.serverId}
          type="button"
          onClick={() => onSelectServer(server.serverId)}
          className={`w-full text-left p-2 rounded cursor-pointer mb-2 ${
            selectedServerId === server.serverId
              ? "bg-[#00FFC6] text-black"
              : "hover:bg-[#1F2937]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="truncate">{server.name || server.serverId}</span>
            <span
              className={`w-2 h-2 rounded-full ${statusColor(server.status)}`}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

export default Sidebar;
