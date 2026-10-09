/**
 * Configurazione Supabase letta dalle variabili d'ambiente, separata dal client.
 * Sta in un modulo a parte perché App.tsx deve sapere subito se Supabase è configurato,
 * ma non deve trascinare @supabase/supabase-js (~60% del JS) nel bundle iniziale della landing.
 */
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Accept the modern "publishable" key (sb_publishable_...) or the legacy "anon" key.
// Both are public, low-privilege keys and work identically with supabase-js.
export const supabasePublicKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

if (!isSupabaseConfigured) {
  console.error(
    "[SecureLocalShare] Variabili d'ambiente Supabase mancanti: VITE_SUPABASE_URL e " +
    "VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY). Vedi .env.example."
  );
}
