import { useCallback, useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { API_BASE_URL } from "../services/api";

function useSocket(selectedServerId) {
  const [liveData, setLiveData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [allServerMetrics, setAllServerMetrics] = useState({}); // serverId → latest metrics
  const socketRef = useRef(null);

  // Create socket once
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = io(API_BASE_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // All metrics — update overview map regardless of selected server
    socket.on("metrics", (data) => {
      setAllServerMetrics((prev) => ({
        ...prev,
        [data.serverId]: data,
      }));
    });

    // Server-side alert notifications
    socket.on("alert:fired", (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
    });

    socket.on("alert:resolved", (alert) => {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alert.id ? { ...a, status: "resolved", message: alert.message } : a
        )
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Filter live data for selected server
  useEffect(() => {
    if (!socketRef.current) return;

    const onMetrics = (data) => {
      if (!selectedServerId || data.serverId !== selectedServerId) return;
      setLiveData((prev) => [...prev.slice(-300), data]);
    };

    socketRef.current.on("metrics", onMetrics);
    return () => {
      socketRef.current?.off("metrics", onMetrics);
    };
  }, [selectedServerId]);

  const resetStream = useCallback(() => {
    setLiveData([]);
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return { liveData, alerts, connected, allServerMetrics, resetStream, clearAlerts };
}

export default useSocket;
