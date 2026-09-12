// paypal-webhook (v4.8.2)
// Finalizza l'ordine quando PayPal notifica il completamento del pagamento.
//
// SICUREZZA (rilievo C2, task 869f13awr) — la function era deployata con
// --no-verify-jwt e accettava QUALSIASI POST anonimo, finalizzando l'ordine
// indicato in custom_id: chiunque conoscesse (o creasse) un order id otteneva il
// piano senza pagare. Adesso ogni evento è verificato da PayPal stesso tramite
// /v1/notifications/verify-webhook-signature con PAYPAL_WEBHOOK_ID, ed è
// rifiutato (401) se la verifica non va a buon fine o se la configurazione manca
// (fail-closed). Gli eventi già processati sono deduplicati su id.
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, claimEvent, finalizeOrder } from "../_shared/orders.ts";

/** Header che PayPal firma e che vanno rigirati tali e quali alla verifica. */
interface PayPalHeaders {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
}

function readSignatureHeaders(req: Request): PayPalHeaders | null {
  const h = (name: string) => req.headers.get(name) ?? "";
  const headers: PayPalHeaders = {
    auth_algo: h("paypal-auth-algo"),
    cert_url: h("paypal-cert-url"),
    transmission_id: h("paypal-transmission-id"),
    transmission_sig: h("paypal-transmission-sig"),
    transmission_time: h("paypal-transmission-time"),
  };
  return Object.values(headers).every((v) => v !== "") ? headers : null;
}

/** Access token OAuth2 di PayPal (client credentials). Null se non ottenibile. */
async function paypalAccessToken(base: string, id: string, secret: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = await res.json();
    return res.ok && body?.access_token ? (body.access_token as string) : null;
  } catch (e) {
    console.error("[paypal-webhook] token OAuth non ottenuto:", e);
    return null;
  }
}

/**
 * Chiede a PayPal di verificare la firma dell'evento. `event` va rispedito come
 * oggetto JSON già parsato: PayPal ricalcola la firma su una serializzazione
 * canonica lato suo, quindi non serve conservare il corpo grezzo.
 */
async function verifyWebhookSignature(
  base: string,
  token: string,
  webhookId: string,
  headers: PayPalHeaders,
  event: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...headers, webhook_id: webhookId, webhook_event: event }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error("[paypal-webhook] verifica firma: HTTP", res.status, JSON.stringify(body));
      return false;
    }
    return body?.verification_status === "SUCCESS";
  } catch (e) {
    console.error("[paypal-webhook] verifica firma non riuscita:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const base = Deno.env.get("PAYPAL_API_BASE") || "https://api-m.sandbox.paypal.com";
  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_SECRET");

  // FAIL-CLOSED: senza PAYPAL_WEBHOOK_ID (o senza credenziali) non è possibile
  // distinguere un evento PayPal da uno forgiato → non si processa nulla.
  if (!webhookId || !clientId || !clientSecret) {
    console.error("[paypal-webhook] configurazione incompleta "
      + "(PAYPAL_WEBHOOK_ID / PAYPAL_CLIENT_ID / PAYPAL_SECRET): evento rifiutato.");
    return json({ error: "webhook_not_configured" }, 401);
  }

  const sigHeaders = readSignatureHeaders(req);
  if (!sigHeaders) {
    console.warn("[paypal-webhook] header di firma mancanti: evento rifiutato.");
    return json({ error: "invalid_signature" }, 401);
  }

  try {
    const event = await req.json();

    const token = await paypalAccessToken(base, clientId, clientSecret);
    if (!token) return json({ error: "verification_unavailable" }, 401);

    const verified = await verifyWebhookSignature(base, token, webhookId, sigHeaders, event);
    if (!verified) {
      console.warn("[paypal-webhook] firma non valida: evento rifiutato.");
      return json({ error: "invalid_signature" }, 401);
    }

    const type = event.event_type as string | undefined;
    console.log("[paypal-webhook] evento verificato:", type, event.id);

    const admin = adminClient();
    // Idempotenza: un evento già processato viene accettato ma ignorato.
    if (!(await claimEvent(admin, "paypal", event.id, type))) {
      return json({ received: true, duplicate: true });
    }

    if (type === "PAYMENT.CAPTURE.COMPLETED" || type === "CHECKOUT.ORDER.APPROVED") {
      const res = event.resource ?? {};
      const orderId =
        res.custom_id ||
        res.purchase_units?.[0]?.custom_id ||
        res.supplementary_data?.related_ids?.order_id;
      console.log("[paypal-webhook] finalizzo ordine:", orderId);
      if (orderId) await finalizeOrder(admin, orderId);
    }
    return json({ received: true });
  } catch (e) {
    // Il dettaglio resta nei log della function, non torna al chiamante (M10).
    console.error("[paypal-webhook] eccezione non gestita:", e);
    return json({ error: "unexpected" }, 500);
  }
});
