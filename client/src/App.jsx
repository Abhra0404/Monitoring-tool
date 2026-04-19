import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "react-toastify/dist/ReactToastify.css";
import AppShell from "./AppShell";
import PublicStatus from "./pages/PublicStatus";
import useSocketStore from "./stores/socketStore";
import { useEffect } from "react";

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
  useEffect(() => { connect(); }, [connect]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketInitializer />
      <BrowserRouter>
        <Routes>
          <Route path="/status" element={<PublicStatus />} />
          <Route path="/*" element={<AppShell />} />
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