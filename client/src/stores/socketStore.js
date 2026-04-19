/**
 * Zustand store for Socket.IO real-time data.
 * Replaces the useSocket hook with a global store that any component can subscribe to.
 */
import { create } from "zustand";
import io from "socket.io-client";
import { API_BASE_URL } from "../services/api";

const useSocketStore = create((set, get) => ({
  // State
  connected: false,
  allServerMetrics: {},   // serverId → latest metrics
  alerts: [],
  httpCheckResults: {},   // checkId → latest result
  pipelineUpdates: [],
  dockerMetrics: {},      // serverId → containers array
  socket: null,

  // Actions
  connect() {
    if (get().socket) return;

    const socket = io(API_BASE_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => set({ connected: true }));
    socket.on("disconnect", () => set({ connected: false }));

    socket.on("metrics", (data) => {
      set((state) => ({
        allServerMetrics: { ...state.allServerMetrics, [data.serverId]: data },
      }));
    });

    socket.on("alert:fired", (alert) => {
      set((state) => ({
        alerts: [alert, ...state.alerts].slice(0, 50),
      }));
    });

    socket.on("alert:resolved", (alert) => {
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === alert.id ? { ...a, status: "resolved", message: alert.message } : a,
        ),
      }));
    });

    socket.on("httpcheck:result", (result) => {
      set((state) => ({
        httpCheckResults: { ...state.httpCheckResults, [result.checkId]: result },
      }));
    });

    socket.on("pipeline:update", (pipeline) => {
      set((state) => ({
        pipelineUpdates: [pipeline, ...state.pipelineUpdates].slice(0, 50),
      }));
    });

    socket.on("docker:metrics", (data) => {
      set((state) => ({
        dockerMetrics: { ...state.dockerMetrics, [data.serverId]: data.containers },
      }));
    });

    set({ socket });
  },

  disconnect() {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  clearAlerts() {
    set({ alerts: [] });
  },
}));

export default useSocketStore;
