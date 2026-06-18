import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Accept the modern "publishable" key (sb_publishable_...) or the legacy "anon" key.
// Both are public, low-privilege keys and work identically with supabase-js.
const publicKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const isSupabaseConfigured = Boolean(url && publicKey);

if (!isSupabaseConfigured) {
  console.error(
    "[SecureLocalShare] Variabili d'ambiente Supabase mancanti: VITE_SUPABASE_URL e " +
    "VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY). Vedi .env.example."
  );
}

// Public key only (publishable/anon). La secret/service_role NON entra mai nel browser.
export const supabase = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  publicKey ?? "placeholder-public-key",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

export const RELEASES_BUCKET = "releases";
export const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes

/**
 * Base URL used to build email-confirmation redirect links. Set VITE_PUBLIC_SITE_URL to the
 * LAN IP in local testing (so the link opens from a phone, not "localhost") or to the Netlify
 * domain in production. Falls back to the current origin. Must be allowlisted in Supabase
 * (Authentication → URL Configuration → Redirect URLs).
 */
export function siteUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  return (configured && configured.replace(/\/+$/, "")) || window.location.origin;
}
