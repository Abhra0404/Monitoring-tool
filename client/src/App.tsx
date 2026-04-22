import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "react-toastify/dist/ReactToastify.css";
import { useEffect } from "react";
import AppShell from "./AppShell";
import PublicStatus from "./pages/PublicStatus";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import useSocketStore from "./stores/socketStore";
import useAuthStore from "./stores/authStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 2,
    },
  },
});

function SocketInitializer() {
  const connect = useSocketStore((s) => s.connect);
  const disconnect = useSocketStore((s) => s.disconnect);
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status === "authenticated") connect();
    else disconnect();
  }, [status, connect, disconnect]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketInitializer />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/status" element={<PublicStatus />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
        </Routes>
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          theme="dark"
          toastClassName="!bg-[#161b22] !border !border-gray-800 !rounded-xl"
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
