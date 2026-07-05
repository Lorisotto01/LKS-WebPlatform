// stripe-webhook (v4.4.0)
// Riceve gli eventi Stripe e finalizza l'ordine su `checkout.session.completed`.
// La firma è verificata con STRIPE_WEBHOOK_SECRET (schema Stripe-Signature).
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, finalizeOrder } from "../_shared/orders.ts";

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

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  if (secret) {
    const ok = await verifyStripeSignature(payload, sig, secret).catch(() => false);
    if (!ok) return json({ error: "invalid_signature" }, 400);
  }

  try {
    const event = JSON.parse(payload);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.order_id || session.client_reference_id;
      if (orderId) await finalizeOrder(adminClient(), orderId);
    }
    return json({ received: true });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
