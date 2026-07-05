// paypal-webhook (v4.4.0)
// Finalizza l'ordine quando PayPal notifica il completamento del pagamento.
// La verifica della firma PayPal (verify-webhook-signature) va abilitata in
// produzione con PAYPAL_WEBHOOK_ID; qui accettiamo l'evento e finalizziamo
// tramite il custom_id (= order id) presente nella risorsa.
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, finalizeOrder } from "../_shared/orders.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const event = await req.json();
    const type = event.event_type as string | undefined;
    if (type === "PAYMENT.CAPTURE.COMPLETED" || type === "CHECKOUT.ORDER.APPROVED") {
      const res = event.resource ?? {};
      const orderId =
        res.custom_id ||
        res.purchase_units?.[0]?.custom_id ||
        res.supplementary_data?.related_ids?.order_id;
      if (orderId) await finalizeOrder(adminClient(), orderId);
    }
    return json({ received: true });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
