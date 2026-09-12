// stripe-webhook (v4.8.2)
// Riceve gli eventi Stripe e finalizza l'ordine su `checkout.session.completed`.
//
// SICUREZZA (rilievo A7, task 869f13awr) — la verifica della firma era fail-open
// (saltata del tutto se STRIPE_WEBHOOK_SECRET non era configurato) e senza difese
// dal replay. La function è deployata con --no-verify-jwt, quindi chiunque poteva
// inviarle eventi forgiati, e un `invoice.paid` legittimo ricatturato estendeva
// l'abbonamento a ogni reinvio. Adesso:
//   * secret mancante  -> 500 e nessun evento processato (fail-closed);
//   * timestamp fuori dalla tolleranza di 5 minuti -> 400 (anti-replay);
//   * confronto della firma a tempo costante;
//   * deduplica su event.id in public.webhook_events (migration 0007).
import { cors } from "../_shared/cors.ts";
import { adminClient, claimEvent, finalizeOrder, recordRenewal } from "../_shared/orders.ts";

/** Tolleranza sul timestamp firmato da Stripe: oltre questa finestra l'evento è un replay. */
const TOLERANCE_SECONDS = 300;

/** Confronto a tempo costante fra due stringhe esadecimali della stessa lunghezza. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type SignatureCheck = { ok: true } | { ok: false; reason: string };

/**
 * Verifica lo schema "t=...,v1=..." dell'header Stripe-Signature senza SDK:
 * HMAC-SHA256 di `${t}.${payload}` con STRIPE_WEBHOOK_SECRET, più il controllo di
 * freschezza sul timestamp. Stripe può inviare più firme v1 (rotazione del
 * secret): l'evento è valido se almeno una combacia.
 */
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<SignatureCheck> {
  const pairs = sigHeader.split(",").map((p) => p.split("="));
  const t = pairs.find((p) => p[0]?.trim() === "t")?.[1]?.trim();
  const signatures = pairs.filter((p) => p[0]?.trim() === "v1").map((p) => p[1]?.trim() ?? "");
  if (!t || signatures.length === 0) return { ok: false, reason: "malformed_signature" };

  // Anti-replay: l'evento deve essere stato firmato di recente.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((v1) => timingSafeEqual(hex, v1))
    ? { ok: true }
    : { ok: false, reason: "signature_mismatch" };
}

Deno.serve(async (req) => {
  // Header CORS decisi sull'Origin di questa richiesta (vedi _shared/cors.ts).
  const { headers: corsHeaders, json } = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  console.log("[stripe-webhook] ricevuta richiesta", req.method);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  // FAIL-CLOSED: senza secret non è possibile distinguere un evento Stripe da uno
  // forgiato, quindi non si processa nulla.
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET non configurato: evento rifiutato.");
    return json({ error: "webhook_not_configured" }, 500);
  }
  const check = await verifyStripeSignature(payload, sig, secret).catch(
    (e): SignatureCheck => {
      console.error("[stripe-webhook] verifica firma non riuscita:", e);
      return { ok: false, reason: "verification_error" };
    },
  );
  if (!check.ok) {
    console.warn("[stripe-webhook] firma rifiutata:", check.reason);
    return json({ error: "invalid_signature" }, 400);
  }

  try {
    const event = JSON.parse(payload);
    console.log("[stripe-webhook] evento:", event.type, event.id);
    const admin = adminClient();

    // Idempotenza: un evento già processato viene accettato (200) ma ignorato,
    // così Stripe non lo ritenta e nessun rinnovo viene contato due volte.
    if (!(await claimEvent(admin, "stripe", event.id, event.type))) {
      return json({ received: true, duplicate: true });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.order_id || session.client_reference_id;
      const subId = typeof session.subscription === "string" ? session.subscription : null;
      console.log("[stripe-webhook] finalizzo ordine:", orderId, "| sub:", subId);
      if (orderId) await finalizeOrder(admin, orderId, { providerSubscriptionId: subId });
    } else if (event.type === "checkout.session.expired") {
      // La sessione è scaduta presso Stripe: chiudiamo subito l'ordine senza
      // aspettare il giro di pg_cron. Solo se è ancora pending — un pagamento
      // arrivato nel frattempo non va toccato.
      const session = event.data.object;
      const orderId = session.metadata?.order_id || session.client_reference_id;
      console.log("[stripe-webhook] sessione scaduta, ordine:", orderId);
      if (orderId) {
        await admin.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
      }
    } else if (event.type === "invoice.paid") {
      // Rinnovo ricorrente automatico (dal secondo ciclo in poi).
      const inv = event.data.object;
      const subId = typeof inv.subscription === "string" ? inv.subscription : null;
      if (subId && inv.billing_reason && inv.billing_reason !== "subscription_create") {
        console.log("[stripe-webhook] rinnovo per sub:", subId);
        await recordRenewal(admin, subId, inv.amount_paid ?? 0);
      }
    } else if (event.type === "customer.subscription.deleted") {
      // Abbonamento annullato: niente più rinnovo (scadrà a fine periodo).
      const sub = event.data.object;
      console.log("[stripe-webhook] subscription cancellata:", sub.id);
      await admin.from("subscriptions")
        .update({ auto_renew: false, cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq("provider_subscription_id", sub.id);
    }
    return json({ received: true });
  } catch (e) {
    // Il dettaglio resta nei log della function, non torna al chiamante (M10).
    console.error("[stripe-webhook] eccezione non gestita:", e);
    return json({ error: "unexpected" }, 500);
  }
});
