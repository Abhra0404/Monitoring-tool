import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import { API_BASE_URL } from "../services/api";

function useSocket(selectedServerId, alertRules) {
  const [liveData, setLiveData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const lastAlertRef = useRef({});

  const socket = useMemo(() => {
    const token = localStorage.getItem("token");
    return io(API_BASE_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
  }, []);

  useEffect(() => {
    const onConnect = () => undefined;
    const onDisconnect = () => undefined;
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    const onMetrics = (newData) => {
      if (!selectedServerId || newData.serverId !== selectedServerId) {
        return;
      }

      setLiveData((prev) => [...prev.slice(-200), newData]);

      const cpuPercent = Math.min(100, (newData.cpu || 0) * 10);
      const memoryPercent = newData.totalMem
        ? ((newData.totalMem - newData.freeMem) / newData.totalMem) * 100
        : 0;

      const nextAlerts = [];

      if (cpuPercent > alertRules.cpuThreshold) {
        nextAlerts.push({
          type: "cpu",
          message: `CPU ${cpuPercent.toFixed(1)}% exceeded threshold ${alertRules.cpuThreshold}% on ${newData.serverId}`,
        });
      }

      if (memoryPercent > alertRules.memoryThreshold) {
        nextAlerts.push({
          type: "memory",
          message: `Memory ${memoryPercent.toFixed(1)}% exceeded threshold ${alertRules.memoryThreshold}% on ${newData.serverId}`,
        });
      }

      if (nextAlerts.length === 0) {
        return;
      }

      setAlerts((prev) => {
        const now = Date.now();
        const filtered = nextAlerts.filter((alert) => {
          const key = `${newData.serverId}:${alert.type}`;
          const last = lastAlertRef.current[key] || 0;
          if (now - last < 20000) {
            return false;
          }
          lastAlertRef.current[key] = now;
          return true;
        });

        if (filtered.length === 0) {
          return prev;
        }

        return [...filtered, ...prev].slice(0, 20);
      });
    };

    socket.on("metrics", onMetrics);

    return () => {
      socket.off("metrics", onMetrics);
    };
  }, [socket, selectedServerId, alertRules]);

  const resetStream = () => {
    setLiveData([]);
    setAlerts([]);
  };

  return { liveData, alerts, resetStream };
}

export default useSocket;
