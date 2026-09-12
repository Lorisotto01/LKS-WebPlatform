// create-checkout (v4.8.2)
// Crea un ordine e avvia il pagamento (Stripe/PayPal) oppure, se NESSUNA chiave
// provider è configurata nell'ambiente, restituisce un link alla pagina di
// pagamento SIMULATA in-app. Il prezzo è calcolato SEMPRE lato server.
//
// SICUREZZA (rilievo C1, task 869f13awr) — il campo `provider` arriva dal client e
// prima non era validato: un valore non riconosciuto (o un provider non
// configurato) faceva cadere l'esecuzione nel ramo finale, creando un ordine
// `provider: "simulated"` anche in produzione. Chiunque poteva poi finalizzarlo
// gratis con simulate-payment. Adesso:
//   * `provider` accetta solo "stripe" | "paypal" (whitelist stretta, 400 altrimenti);
//   * se il provider richiesto non ha le chiavi configurate si risponde 400, senza
//     mai ripiegare su un altro provider né sulla modalità simulata;
//   * la modalità simulata è raggiungibile SOLO quando l'ambiente non ha alcuna
//     chiave provider (sviluppo), mai in base a quanto inviato dal client.
//
// ORDINE DELLE OPERAZIONI — l'ordine su DB è l'ULTIMA cosa che scriviamo.
// Prima si apre la sessione presso il provider, e solo se quella riesce si
// registra il record. Se il provider rifiuta (chiave sbagliata, importo non
// valido, rete) la richiesta torna in errore senza aver lasciato in dashboard
// un ordine "pending" che non potrà mai essere pagato.
// L'id dell'ordine serve però al provider come riferimento, quindi lo generiamo
// noi in anticipo e lo passiamo all'insert: è lo stesso uuid che i webhook
// ritroveranno in metadata/custom_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors } from "../_shared/cors.ts";
import { adminClient, computePrice, type PlanCode } from "../_shared/orders.ts";

interface Body {
  kind: "subscription" | "lock";
  planCode?: PlanCode;
  billingCycle?: "month" | "year";
  lockType?: "env" | "perm";
  provider?: "stripe" | "paypal";
  hwid?: string;        // per gli sblocchi LOCK (dispositivo)
  recurring?: boolean;  // abbonamento con rinnovo automatico
}

/** Provider di pagamento accettati dal client. Qualsiasi altro valore è un 400. */
const ALLOWED_PROVIDERS = ["stripe", "paypal"] as const;

/** Minuti di validità di un tentativo di pagamento (vedi orders.expires_at). */
const TTL_MINUTES = 30;
/** Importo minimo accettato da Stripe per una transazione in EUR. */
const STRIPE_MIN_CENTS = 50;

function siteUrl(req: Request): string {
  return Deno.env.get("PUBLIC_SITE_URL") || req.headers.get("origin") || "http://localhost:5173";
}

/** Messaggio leggibile a partire dal corpo d'errore di Stripe. */
function stripeMessage(payload: any): string {
  const e = payload?.error ?? {};
  const keyProblem = e.code === "secret_key_required"
    || e.code === "api_key_expired"
    || (e.type === "invalid_request_error" && /API key/i.test(e.message ?? ""));
  if (keyProblem) {
    return "Configurazione Stripe non valida: STRIPE_SECRET_KEY deve contenere la chiave SEGRETA (sk_… o rk_…), non quella pubblicabile.";
  }
  return e.message || "Stripe ha rifiutato la creazione della sessione di pagamento.";
}

Deno.serve(async (req) => {
  // Header CORS decisi sull'Origin di questa richiesta (vedi _shared/cors.ts).
  const { headers: corsHeaders, json } = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // 1) Autenticazione utente dal JWT Supabase.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    const email = userRes?.user?.email;
    if (!email) return json({ error: "unauthorized", message: "Sessione scaduta: effettua di nuovo l'accesso." }, 401);

    const body = (await req.json()) as Body;
    if (body.kind !== "subscription" && body.kind !== "lock") {
      return json({ error: "invalid_kind", message: "Tipo di acquisto non valido." }, 400);
    }
    if (body.kind === "subscription") {
      if (!body.planCode) return json({ error: "invalid_plan", message: "Piano non specificato." }, 400);
      if (body.billingCycle !== "month" && body.billingCycle !== "year") {
        return json({ error: "invalid_cycle", message: "Periodicità di fatturazione non valida." }, 400);
      }
    } else if (body.lockType !== "env" && body.lockType !== "perm") {
      return json({ error: "invalid_lock_type", message: "Tipo di sblocco non valido." }, 400);
    }

    // 2) Provider: whitelist stretta PRIMA di qualunque altra cosa (C1).
    const requested = body.provider ?? "stripe";
    if (!ALLOWED_PROVIDERS.includes(requested as typeof ALLOWED_PROVIDERS[number])) {
      console.warn("[create-checkout] provider non ammesso dal client:", requested);
      return json({ error: "invalid_provider", message: "Metodo di pagamento non valido." }, 400);
    }

    // Chiavi disponibili nell'AMBIENTE: sono queste — e solo queste — a decidere
    // se un provider è utilizzabile e se la modalità simulata è ammessa.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const paypalId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalSecret = Deno.env.get("PAYPAL_SECRET");
    const hasStripe = !!stripeKey;
    const hasPaypal = !!(paypalId && paypalSecret);
    const simulationOnly = !hasStripe && !hasPaypal;

    // Provider richiesto ma non configurato: errore esplicito. MAI un ripiego
    // silenzioso su un altro provider o sulla modalità simulata.
    if (!simulationOnly) {
      if (requested === "stripe" && !hasStripe) {
        return json({
          error: "provider_unavailable",
          message: "Pagamento con carta non disponibile: usa PayPal.",
        }, 400);
      }
      if (requested === "paypal" && !hasPaypal) {
        return json({
          error: "provider_unavailable",
          message: "Pagamento con PayPal non disponibile: usa la carta.",
        }, 400);
      }
    }

    const admin = adminClient();
    // Piano attuale (serve per il prezzo dei LOCK).
    const { data: reg } = await admin.from("registrations").select("plan").eq("email", email).maybeSingle();
    const currentPlan = ((reg?.plan ?? "free").toLowerCase()) as PlanCode;

    // 3) Prezzo server-side + sconto attivo.
    let price;
    try {
      price = await computePrice(admin, {
        kind: body.kind,
        planCode: body.planCode,
        billingCycle: body.billingCycle,
        lockType: body.lockType,
        currentPlan,
      });
    } catch (e) {
      const code = String(e instanceof Error ? e.message : e);
      console.error("[create-checkout] prezzo non calcolabile:", code);
      return json({
        error: code,
        message: code === "invalid_plan"
          ? "Il piano richiesto non esiste o non è più disponibile."
          : "Listino prezzi non disponibile, riprova tra poco.",
      }, 400);
    }

    // 4) Riferimenti dell'ordine: l'uuid è generato QUI ma scritto su DB solo
    //    a sessione di pagamento ottenuta.
    const orderId = crypto.randomUUID();
    const site = siteUrl(req);
    const successUrl = `${site}/checkout/result?status=success&order=${orderId}`;
    const cancelUrl = `${site}/checkout/result?status=cancel&order=${orderId}`;
    // Scadenza del tentativo. Per Stripe usiamo la scadenza REALE della sessione
    // (che richiede almeno 30 minuti di margine): così non marchiamo mai failed
    // un ordine che presso il provider sarebbe ancora pagabile.
    let expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

    const orderRow = {
      id: orderId,
      email,
      kind: body.kind,
      plan_code: body.kind === "subscription" ? body.planCode : null,
      billing_cycle: body.kind === "subscription" ? body.billingCycle : null,
      lock_type: body.kind === "lock" ? body.lockType : null,
      hwid: body.kind === "lock" ? (body.hwid ?? null) : null,
      is_recurring: body.kind === "subscription" ? !!body.recurring : false,
      base_cents: price.baseCents,
      discount_id: price.discountId,
      amount_cents: price.amountCents,
      status: "pending",
    };

    /** Scrive l'ordine. Se fallisce, il chiamante annulla la sessione appena creata. */
    const saveOrder = async (fields: { provider: string; provider_ref: string | null }) => {
      const { error } = await admin.from("orders").insert({
        ...orderRow,
        ...fields,
        expires_at: expiresAt.toISOString(),
      });
      if (error) console.error("[create-checkout] insert ordine fallito:", error.message);
      return error;
    };

    console.log("[create-checkout] provider richiesto:", requested,
      "| stripe:", hasStripe, "| paypal:", hasPaypal, "| simulazione:", simulationOnly);

    const recurring = body.kind === "subscription" && !!body.recurring;

    // 5) Avvio pagamento presso il provider configurato.
    if (!simulationOnly && requested === "stripe") {
      // Guardia di configurazione: una chiave pubblicabile qui produrrebbe un 403
      // `secret_key_required` dopo il giro di rete. Meglio dirlo subito e chiaro.
      if (!/^(sk|rk)_/.test(stripeKey!.trim())) {
        console.error("[create-checkout] STRIPE_SECRET_KEY non è una chiave segreta (prefisso:", stripeKey!.slice(0, 3), ")");
        return json({
          error: "stripe_config",
          message: "Configurazione Stripe non valida: STRIPE_SECRET_KEY deve contenere la chiave SEGRETA (sk_… o rk_…), non quella pubblicabile.",
        }, 500);
      }
      if (price.amountCents < STRIPE_MIN_CENTS) {
        return json({
          error: "amount_too_low",
          message: `Importo troppo basso per il pagamento con carta (minimo ${(STRIPE_MIN_CENTS / 100).toFixed(2)}€).`,
        }, 400);
      }

      // Stripe pretende almeno 30 minuti di margine su expires_at: due minuti di
      // grazia assorbono la latenza della chiamata.
      const stripeExpiresSec = Math.floor((Date.now() + (TTL_MINUTES * 60 + 120) * 1000) / 1000);

      const form = new URLSearchParams();
      form.set("success_url", successUrl);
      form.set("cancel_url", cancelUrl);
      form.set("client_reference_id", orderId);
      form.set("customer_email", email);
      form.set("metadata[order_id]", orderId);
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "eur");
      form.set("line_items[0][price_data][unit_amount]", String(price.amountCents));
      form.set("line_items[0][price_data][product_data][name]", price.label);
      if (recurring) {
        // Abbonamento ricorrente reale: Stripe rinnova e addebita in automatico.
        form.set("mode", "subscription");
        form.set("line_items[0][price_data][recurring][interval]", body.billingCycle === "year" ? "year" : "month");
        form.set("subscription_data[metadata][order_id]", orderId);
      } else {
        form.set("mode", "payment");
        // expires_at è accettato solo in mode=payment; in subscription la sessione
        // usa la finestra di default di Stripe e il TTL resta quello del DB.
        form.set("expires_at", String(stripeExpiresSec));
      }

      const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const session = await r.json();
      if (!r.ok) {
        // Nessun record scritto: il tentativo non è mai partito. Il dettaglio
        // tecnico resta nei log della function, non torna al client (M10).
        console.error("[create-checkout] Stripe ha rifiutato:", r.status, JSON.stringify(session?.error ?? session));
        return json({ error: "stripe_error", message: stripeMessage(session) }, 502);
      }
      if (!recurring) expiresAt = new Date(stripeExpiresSec * 1000);

      const oErr = await saveOrder({ provider: "stripe", provider_ref: session.id ?? null });
      if (oErr) {
        // Sessione creata ma ordine non registrato: la chiudiamo, altrimenti un
        // pagamento andrebbe a buon fine senza un ordine da finalizzare.
        await fetch(`https://api.stripe.com/v1/checkout/sessions/${session.id}/expire`, {
          method: "POST",
          headers: { Authorization: `Bearer ${stripeKey}` },
        }).catch(() => {});
        return json({ error: "order_create_failed", message: "Ordine non registrato, riprova." }, 500);
      }
      console.log("[create-checkout] ordine creato", { id: orderId, provider: "stripe", amount: price.amountCents, kind: body.kind });
      return json({ url: session.url, provider: "stripe", orderId, expiresAt: expiresAt.toISOString() });
    }

    if (!simulationOnly && requested === "paypal") {
      const base = Deno.env.get("PAYPAL_API_BASE") || "https://api-m.sandbox.paypal.com";
      const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${paypalId}:${paypalSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const tokenBody = await tokenRes.json();
      if (!tokenRes.ok || !tokenBody?.access_token) {
        console.error("[create-checkout] PayPal auth fallita:", tokenRes.status, JSON.stringify(tokenBody));
        return json({
          error: "paypal_auth_error",
          message: "Configurazione PayPal non valida: controlla PAYPAL_CLIENT_ID / PAYPAL_SECRET.",
        }, 502);
      }
      const orderRes = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenBody.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            custom_id: orderId,
            description: price.label,
            amount: { currency_code: "EUR", value: (price.amountCents / 100).toFixed(2) },
          }],
          application_context: { return_url: successUrl, cancel_url: cancelUrl },
        }),
      });
      const pp = await orderRes.json();
      if (!orderRes.ok) {
        console.error("[create-checkout] PayPal ha rifiutato:", orderRes.status, JSON.stringify(pp));
        return json({
          error: "paypal_error",
          message: pp?.details?.[0]?.description || pp?.message || "PayPal ha rifiutato la creazione dell'ordine.",
        }, 502);
      }
      const approve = (pp.links ?? []).find((l: any) => l.rel === "approve")?.href;
      if (!approve) {
        console.error("[create-checkout] PayPal non ha restituito il link di approvazione:", JSON.stringify(pp));
        return json({ error: "paypal_error", message: "PayPal non ha restituito il link di pagamento." }, 502);
      }

      const oErr = await saveOrder({ provider: "paypal", provider_ref: pp.id ?? null });
      if (oErr) return json({ error: "order_create_failed", message: "Ordine non registrato, riprova." }, 500);
      console.log("[create-checkout] ordine creato", { id: orderId, provider: "paypal", amount: price.amountCents, kind: body.kind });
      return json({ url: approve, provider: "paypal", orderId, expiresAt: expiresAt.toISOString() });
    }

    // 6) Nessuna chiave provider nell'ambiente → modalità SIMULATA (solo sviluppo).
    //    Si arriva qui esclusivamente con simulationOnly === true.
    console.log("[create-checkout] nessuna chiave provider → modalità SIMULATA per ordine", orderId);
    const oErr = await saveOrder({ provider: "simulated", provider_ref: null });
    if (oErr) return json({ error: "order_create_failed", message: "Ordine non registrato, riprova." }, 500);
    return json({
      url: `${site}/checkout/simulate?order=${orderId}`,
      provider: "simulated",
      orderId,
      amountCents: price.amountCents,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    // Il dettaglio dell'eccezione resta nei log, non viene rimandato al client (M10).
    console.error("[create-checkout] eccezione non gestita:", e);
    return json({ error: "unexpected", message: "Avvio pagamento non riuscito." }, 500);
  }
});
