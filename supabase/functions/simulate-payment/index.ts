// simulate-payment (v4.4.0)
// Finalizza un ordine in modalità SIMULATA: usata quando non sono configurate le
// chiavi di Stripe/PayPal. Richiede il JWT dell'utente e verifica che l'ordine sia
// suo e ancora pending. In produzione con provider reali questa funzione non serve.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, finalizeOrder } from "../_shared/orders.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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

    await finalizeOrder(admin, orderId);
    return json({ ok: true, orderId });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
