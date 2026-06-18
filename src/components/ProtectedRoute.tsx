import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-10 text-center text-muted-foreground">Caricamento…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
