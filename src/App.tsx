import { Routes, Route, Navigate } from "react-router-dom";
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
import { AdminReleases } from "./pages/AdminReleases";
import { SetupRequired } from "./pages/SetupRequired";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Docs } from "./pages/Docs";
import { Changelog } from "./pages/Changelog";

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;

  return (
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
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminReleases />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
