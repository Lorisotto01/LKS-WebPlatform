// CORS condiviso per le Edge Functions (v4.8.2).
//
// SICUREZZA (rilievo B5, task 869f13awr) — l'header era fisso a `*`, cioè qualsiasi sito poteva far
// partire richieste a queste function dal browser di un visitatore. L'impatto era contenuto (le
// function si autenticano con il Bearer token, non con i cookie, quindi il browser non allegava da
// solo la sessione), ma non c'è motivo di lasciare la porta aperta: l'origine ammessa è ora quella
// del sito, letta da PUBLIC_SITE_URL.
//
// I client non-browser — la DesktopApp per `device-unlock` e `release-download`, i webhook di
// Stripe e PayPal — non fanno preflight e non sono toccati: il CORS è un controllo che vive solo
// dentro al browser.
//
// Se PUBLIC_SITE_URL non è configurata si ricade su `*`, così un ambiente di sviluppo appena
// creato continua a funzionare; in produzione la variabile è già obbligatoria per i success_url
// del checkout.
const SITE_ORIGIN = (() => {
  const raw = Deno.env.get("PUBLIC_SITE_URL");
  if (!raw) return "*";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
})();

export const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // L'origine ammessa dipende dalla configurazione: le cache intermedie non devono riusare la
  // stessa risposta per origini diverse.
  "Vary": "Origin",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
