import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** Protects /admin: requires a logged-in user whose app_metadata.role === 'admin'. */
export function AdminRoute() {
  const { session, loading, isAdmin } = useAuth();
  if (loading) return <div className="p-10 text-center text-muted-foreground">Caricamento…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
