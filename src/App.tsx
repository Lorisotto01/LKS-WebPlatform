import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { isSupabaseConfigured } from "./lib/supabase";
import { Home } from "./pages/Home";
import { Register } from "./pages/Register";
import { VerifyEmail } from "./pages/VerifyEmail";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { ReleaseTab } from "./pages/admin/ReleaseTab";
import { ReportsTab } from "./pages/admin/ReportsTab";
import { DocsManagerTab } from "./pages/admin/DocsManagerTab";
import { AnalyticsTab } from "./pages/admin/AnalyticsTab";
import { SetupRequired } from "./pages/SetupRequired";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Docs } from "./pages/Docs";
import { Changelog } from "./pages/Changelog";
import { ChiSono } from "./pages/ChiSono";
import { Funzionalita } from "./pages/Funzionalita";
import { Sicurezza } from "./pages/Sicurezza";
import { Recensioni } from "./pages/Recensioni";

// Ad ogni cambio di route (redirect inclusi) riporta la vista in cima alla pagina.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;

  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/changelog" element={<Changelog />} />
      {/* Nuove pagine landing v4.3.4 */}
      <Route path="/chi-sono" element={<ChiSono />} />
      <Route path="/funzionalita" element={<Funzionalita />} />
      {/* Alias con accento per comodità (URL codificato) */}
      <Route path="/funzionalità" element={<Navigate to="/funzionalita" replace />} />
      <Route path="/sicurezza" element={<Sicurezza />} />
      <Route path="/recensioni" element={<Recensioni />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="release" replace />} />
          <Route path="release" element={<ReleaseTab />} />
          <Route path="segnalazioni" element={<ReportsTab />} />
          <Route path="docs-manager" element={<DocsManagerTab />} />
          <Route path="analytics" element={<AnalyticsTab />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
