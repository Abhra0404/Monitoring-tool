import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import useAuthStore from "../stores/authStore";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
