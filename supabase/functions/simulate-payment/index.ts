// simulate-payment (v4.8.2)
// Finalizza un ordine in modalità SIMULATA: serve solo in sviluppo, quando non è
// configurata alcuna chiave di Stripe/PayPal. Richiede il JWT dell'utente e
// verifica che l'ordine sia suo, ancora pending e davvero "simulated".
//
// SICUREZZA (rilievo C1, task 869f13awr) — questa function era la seconda metà del
// bypass del pagamento: bastava farsi creare un ordine "simulated" da
// create-checkout (che non validava il provider) e finalizzarlo qui gratis, anche
// con Stripe attivo in produzione. Adesso la function si disattiva da sola non
// appena l'ambiente ha una qualsiasi chiave provider configurata: in produzione
// risponde 403 e non finalizza nulla, indipendentemente dallo stato dell'ordine.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors } from "../_shared/cors.ts";
import { adminClient, finalizeOrder } from "../_shared/orders.ts";

/** True quando l'ambiente ha almeno un provider di pagamento reale configurato. */
function realProviderConfigured(): boolean {
  const stripe = !!Deno.env.get("STRIPE_SECRET_KEY");
  const paypal = !!(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_SECRET"));
  return stripe || paypal;
}

Deno.serve(async (req) => {
  // Header CORS decisi sull'Origin di questa richiesta (vedi _shared/cors.ts).
  const { headers: corsHeaders, json } = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Interruttore di sicurezza: con un provider reale configurato la simulazione
  // non è mai ammessa. Prima di qualsiasi lettura o scrittura.
  if (realProviderConfigured()) {
    console.warn("[simulate-payment] richiesta rifiutata: provider di pagamento reale configurato.");
    return json({
      error: "simulation_disabled",
      message: "Pagamento simulato non disponibile: usa un metodo di pagamento reale.",
    }, 403);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    const email = userRes?.user?.email;
    if (!email) return json({ error: "unauthorized" }, 401);

    const { orderId } = await req.json();
    if (!orderId) return json({ error: "missing_order" }, 400);

    const admin = adminClient();
    const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) return json({ error: "order_not_found" }, 404);
    if (order.email !== email) return json({ error: "forbidden" }, 403);
    if (order.provider !== "simulated") return json({ error: "not_simulated" }, 400);
    if (order.status === "paid") return json({ ok: true, alreadyPaid: true });
    // TTL scaduto o annullato dall'utente: il tentativo va rifatto da zero.
    // Qui non c'è un provider reale che possa sbloccare la situazione dopo.
    if (order.status !== "pending" || new Date(order.expires_at) < new Date()) {
      return json({ error: "order_expired", message: "Ordine scaduto: ripeti l'acquisto." }, 410);
    }

    console.log("[simulate-payment] finalizzo ordine simulato:", orderId);
    await finalizeOrder(admin, orderId);
    return json({ ok: true, orderId });
  } catch (e) {
    // Il dettaglio resta nei log della function, non torna al client (M10).
    console.error("[simulate-payment] eccezione non gestita:", e);
    return json({ error: "unexpected", message: "Operazione non riuscita." }, 500);
  }
});
