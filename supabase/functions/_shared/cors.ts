// CORS condiviso per le Edge Functions (v4.8.2).
//
// SICUREZZA (rilievo B5, task 869f13awr) — l'header era fisso a `*`, cioè qualsiasi sito poteva far
// partire richieste a queste function dal browser di un visitatore. L'impatto era contenuto (le
// function si autenticano con il Bearer token, non con i cookie, quindi il browser non allegava da
// solo la sessione), ma non c'è motivo di lasciare la porta aperta.
//
// REGRESSIONE CORRETTA — la prima stesura del rilievo scriveva un singolo valore fisso, letto da
// PUBLIC_SITE_URL. `Access-Control-Allow-Origin` ammette un solo valore (o `*`) e mai una lista,
// quindi restituire sempre il dominio di produzione bloccava nel browser OGNI chiamata fatta da
// un'altra origine: sviluppo su localhost, dev in LAN (`http://192.168.1.x:5173`, quello
// documentato in .env.example) e deploy preview di Netlify. L'origine ammessa va invece decisa
// per richiesta: si legge l'header `Origin`, e lo si rimanda indietro tale e quale solo se
// compare nella allow-list.
//
// Allow-list:
//   1. l'origine di PUBLIC_SITE_URL (il sito di produzione);
//   2. i deploy preview / branch deploy dello stesso sito Netlify (`*--<sito>.netlify.app`);
//   3. le origini extra elencate in ALLOWED_ORIGINS (separate da virgola);
//   4. localhost / 127.0.0.1 / indirizzi di rete privata su qualsiasi porta — servono allo
//      sviluppo. Restano comunque richieste che devono portare un Bearer token valido: il CORS
//      non è ciò che autentica, decide solo da quali pagine il browser può partire.
//
// A un'origine non ammessa si risponde con l'origine di produzione: il browser rileva la
// discordanza e blocca, che è esattamente il comportamento voluto.
//
// Senza PUBLIC_SITE_URL né ALLOWED_ORIGINS si ricade su `*`, così un ambiente appena creato
// funziona subito; in produzione PUBLIC_SITE_URL è già obbligatoria per i success_url del checkout.
//
// I client non-browser — la DesktopApp per `device-unlock` e `release-download`, i webhook di
// Stripe e PayPal — non fanno preflight e non sono toccati: il CORS vive solo dentro al browser.

/** Normalizza una stringa di configurazione in una origine (`https://host[:porta]`). */
function toOrigin(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    return new URL(v).origin;
  } catch {
    return v.replace(/\/+$/, "");
  }
}

const SITE_ORIGIN = toOrigin(Deno.env.get("PUBLIC_SITE_URL") ?? "");

const EXTRA_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map(toOrigin)
  .filter((o): o is string => o !== null);

/** Nessuna configurazione: ambiente di sviluppo appena creato, si lascia passare tutto. */
const WIDE_OPEN = SITE_ORIGIN === null && EXTRA_ORIGINS.length === 0;

/**
 * Deploy preview e branch deploy del sito di produzione, quando questo è su Netlify:
 * `https://<sito>.netlify.app` ammette anche `https://<qualsiasi-cosa>--<sito>.netlify.app`.
 * Solo Netlify può emettere quei sottodomini per quel sito, quindi non allarga l'esposizione.
 */
const NETLIFY_PREVIEW = (() => {
  if (!SITE_ORIGIN) return null;
  const m = SITE_ORIGIN.match(/^https:\/\/([a-z0-9-]+)\.netlify\.app$/i);
  return m ? new RegExp(`^https://[a-z0-9-]+--${m[1]}\\.netlify\\.app$`, "i") : null;
})();

/** localhost, 127.0.0.1, ::1 e reti private (10/8, 172.16/12, 192.168/16) su qualsiasi porta. */
const DEV_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

function isAllowed(origin: string): boolean {
  if (origin === SITE_ORIGIN) return true;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  if (NETLIFY_PREVIEW?.test(origin)) return true;
  return DEV_ORIGIN.test(origin);
}

/** Origine da dichiarare nella risposta a questa richiesta. */
function allowOrigin(req: Request): string {
  if (WIDE_OPEN) return "*";
  const origin = req.headers.get("origin");
  if (origin && isAllowed(origin)) return origin;
  // Origine assente (client non-browser) o non ammessa: si dichiara il sito di produzione.
  return SITE_ORIGIN ?? "*";
}

export interface Cors {
  /** Header CORS da usare nella risposta al preflight `OPTIONS`. */
  headers: Record<string, string>;
  /** Risposta JSON con gli header CORS di questa richiesta già applicati. */
  json: (body: unknown, status?: number) => Response;
}

/**
 * Va chiamata come prima cosa dentro al gestore, destrutturando i due nomi:
 *
 *     const { headers: corsHeaders, json } = cors(req);
 *
 * così ogni `json(...)` successivo risponde con l'origine giusta per quella richiesta.
 */
export function cors(req: Request): Cors {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, stripe-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // L'origine ammessa dipende dalla richiesta: le cache intermedie non devono riusare la
    // stessa risposta per origini diverse.
    "Vary": "Origin",
  };
  return {
    headers,
    json: (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, "Content-Type": "application/json" },
      }),
  };
}
