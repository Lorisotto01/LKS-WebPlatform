// create-checkout (v4.4.0)
// Crea un ordine e avvia il pagamento (Stripe/PayPal) oppure, se le chiavi del
// provider non sono configurate, restituisce un link alla pagina di pagamento
// SIMULATA in-app. Il prezzo è calcolato SEMPRE lato server.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
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

function siteUrl(req: Request): string {
  return Deno.env.get("PUBLIC_SITE_URL") || req.headers.get("origin") || "http://localhost:5173";
}

Deno.serve(async (req) => {
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
    if (!email) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (body.kind !== "subscription" && body.kind !== "lock") return json({ error: "invalid_kind" }, 400);

    const admin = adminClient();
    // Piano attuale (serve per il prezzo dei LOCK).
    const { data: reg } = await admin.from("registrations").select("plan").eq("email", email).maybeSingle();
    const currentPlan = ((reg?.plan ?? "free").toLowerCase()) as PlanCode;

    // 2) Prezzo server-side + sconto attivo.
    const price = await computePrice(admin, {
      kind: body.kind,
      planCode: body.planCode,
      billingCycle: body.billingCycle,
      lockType: body.lockType,
      currentPlan,
    });

    // 3) Crea l'ordine (pending).
    const provider = body.provider ?? "stripe";
    const { data: order, error: oErr } = await admin.from("orders").insert({
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
      provider,
      status: "pending",
    }).select().single();
    if (oErr || !order) return json({ error: "order_create_failed", detail: oErr?.message }, 500);
    console.log("[create-checkout] ordine creato", { id: order.id, provider, amount: price.amountCents, kind: body.kind });

    const site = siteUrl(req);
    const successUrl = `${site}/checkout/result?status=success&order=${order.id}`;
    const cancelUrl = `${site}/checkout/result?status=cancel&order=${order.id}`;

    // 4) Avvio pagamento in base al provider disponibile.
    console.log("[create-checkout] provider richiesto:", provider, "| stripeKey:", !!Deno.env.get("STRIPE_SECRET_KEY"), "| paypal:", !!Deno.env.get("PAYPAL_CLIENT_ID"));
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const paypalId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalSecret = Deno.env.get("PAYPAL_SECRET");

    const recurring = body.kind === "subscription" && !!body.recurring;
    if (provider === "stripe" && stripeKey) {
      const form = new URLSearchParams();
      form.set("success_url", successUrl);
      form.set("cancel_url", cancelUrl);
      form.set("client_reference_id", order.id);
      form.set("metadata[order_id]", order.id);
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "eur");
      form.set("line_items[0][price_data][unit_amount]", String(price.amountCents));
      form.set("line_items[0][price_data][product_data][name]", price.label);
      if (recurring) {
        // Abbonamento ricorrente reale: Stripe rinnova e addebita in automatico.
        form.set("mode", "subscription");
        form.set("line_items[0][price_data][recurring][interval]", body.billingCycle === "year" ? "year" : "month");
        form.set("subscription_data[metadata][order_id]", order.id);
      } else {
        form.set("mode", "payment");
      }
      const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const session = await r.json();
      if (!r.ok) return json({ error: "stripe_error", detail: session }, 502);
      await admin.from("orders").update({ provider_ref: session.id }).eq("id", order.id);
      return json({ url: session.url, provider: "stripe", orderId: order.id });
    }

    if (provider === "paypal" && paypalId && paypalSecret) {
      const base = Deno.env.get("PAYPAL_API_BASE") || "https://api-m.sandbox.paypal.com";
      const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${paypalId}:${paypalSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const token = (await tokenRes.json()).access_token;
      const orderRes = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            custom_id: order.id,
            description: price.label,
            amount: { currency_code: "EUR", value: (price.amountCents / 100).toFixed(2) },
          }],
          application_context: { return_url: successUrl, cancel_url: cancelUrl },
        }),
      });
      const pp = await orderRes.json();
      if (!orderRes.ok) return json({ error: "paypal_error", detail: pp }, 502);
      await admin.from("orders").update({ provider_ref: pp.id }).eq("id", order.id);
      const approve = (pp.links ?? []).find((l: any) => l.rel === "approve")?.href;
      return json({ url: approve, provider: "paypal", orderId: order.id });
    }

    // 5) Nessuna chiave provider: modalità SIMULATA (pagamento fittizio in-app).
    console.log("[create-checkout] nessuna chiave provider → modalità SIMULATA per ordine", order.id);
    await admin.from("orders").update({ provider: "simulated" }).eq("id", order.id);
    return json({
      url: `${site}/checkout/simulate?order=${order.id}`,
      provider: "simulated",
      orderId: order.id,
      amountCents: price.amountCents,
    });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
