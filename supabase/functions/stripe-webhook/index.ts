// stripe-webhook (v4.4.0)
// Riceve gli eventi Stripe e finalizza l'ordine su `checkout.session.completed`.
// La firma è verificata con STRIPE_WEBHOOK_SECRET (schema Stripe-Signature).
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, finalizeOrder, recordRenewal } from "../_shared/orders.ts";

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  // Verifica HMAC-SHA256 dello schema "t=...,v1=..." senza SDK Stripe.
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  console.log("[stripe-webhook] ricevuta richiesta", req.method);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  if (secret) {
    const ok = await verifyStripeSignature(payload, sig, secret).catch(() => false);
    if (!ok) return json({ error: "invalid_signature" }, 400);
  }

  try {
    const event = JSON.parse(payload);
    console.log("[stripe-webhook] evento:", event.type);
    const admin = adminClient();

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
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
