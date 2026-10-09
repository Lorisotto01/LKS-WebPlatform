import { Suspense, lazy, useEffect, type ComponentType } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { isSupabaseConfigured } from "./lib/supabaseEnv";
import { Home } from "./pages/Home";
import { SetupRequired } from "./pages/SetupRequired";

/**
 * Code splitting: solo la Home (pagina d'ingresso) sta nel bundle iniziale, le altre pagine
 * vengono scaricate quando servono. Le pagine esportano componenti con nome, da qui l'helper.
 */
function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
}

const Register = lazyPage(() => import("./pages/Register"), "Register");
const VerifyEmail = lazyPage(() => import("./pages/VerifyEmail"), "VerifyEmail");
const Login = lazyPage(() => import("./pages/Login"), "Login");
const ForgotPassword = lazyPage(() => import("./pages/ForgotPassword"), "ForgotPassword");
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"), "ResetPassword");
const Dashboard = lazyPage(() => import("./pages/Dashboard"), "Dashboard");
const AdminLayout = lazyPage(() => import("./pages/admin/AdminLayout"), "AdminLayout");
const ReleaseTab = lazyPage(() => import("./pages/admin/ReleaseTab"), "ReleaseTab");
const ReportsTab = lazyPage(() => import("./pages/admin/ReportsTab"), "ReportsTab");
const DocsManagerTab = lazyPage(() => import("./pages/admin/DocsManagerTab"), "DocsManagerTab");
const AnalyticsTab = lazyPage(() => import("./pages/admin/AnalyticsTab"), "AnalyticsTab");
const AccountingTab = lazyPage(() => import("./pages/admin/AccountingTab"), "AccountingTab");
const Privacy = lazyPage(() => import("./pages/Privacy"), "Privacy");
const Terms = lazyPage(() => import("./pages/Terms"), "Terms");
const Docs = lazyPage(() => import("./pages/Docs"), "Docs");
const Changelog = lazyPage(() => import("./pages/Changelog"), "Changelog");
const ChiSono = lazyPage(() => import("./pages/ChiSono"), "ChiSono");
const Funzionalita = lazyPage(() => import("./pages/Funzionalita"), "Funzionalita");
const Sicurezza = lazyPage(() => import("./pages/Sicurezza"), "Sicurezza");
const Recensioni = lazyPage(() => import("./pages/Recensioni"), "Recensioni");
const Faq = lazyPage(() => import("./pages/Faq"), "Faq");
const Pricing = lazyPage(() => import("./pages/Pricing"), "Pricing");
const Checkout = lazyPage(() => import("./pages/Checkout"), "Checkout");
const CheckoutResult = lazyPage(() => import("./pages/CheckoutResult"), "CheckoutResult");
const CheckoutSimulate = lazyPage(() => import("./pages/CheckoutSimulate"), "CheckoutSimulate");

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
      {/* Fallback vuoto a tutta altezza: il footer non salta su durante il caricamento della pagina */}
      <Suspense fallback={<div className="min-h-screen" />}>
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
      <Route path="/pricing" element={<Pricing />} />
      {/* Alias italiano per comodità */}
      <Route path="/prezzi" element={<Navigate to="/pricing" replace />} />
      <Route path="/recensioni" element={<Recensioni />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/checkout/result" element={<CheckoutResult />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/checkout/simulate" element={<CheckoutSimulate />} />
      </Route>
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="release" replace />} />
          <Route path="release" element={<ReleaseTab />} />
          <Route path="segnalazioni" element={<ReportsTab />} />
          <Route path="docs-manager" element={<DocsManagerTab />} />
          <Route path="analytics" element={<AnalyticsTab />} />
          <Route path="contabilita" element={<AccountingTab />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
