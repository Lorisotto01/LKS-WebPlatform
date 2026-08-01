// Logica condivisa: prezzo server-side e finalizzazione ordine (v4.4.0).
// Usata da create-checkout, simulate-payment e dai webhook Stripe/PayPal.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PlanCode = "free" | "essential" | "pro";

/** Client con service_role: bypassa RLS. Usato SOLO lato server. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export interface PriceResult {
  baseCents: number;
  amountCents: number;
  discountId: string | null;
  label: string;
}

/**
 * Calcola il prezzo di un acquisto leggendo i prezzi di listino dei piani e
 * l'eventuale sconto a tempo attivo. Mai fidarsi dell'importo inviato dal client.
 */
export async function computePrice(
  admin: SupabaseClient,
  opts: {
    kind: "subscription" | "lock";
    planCode?: PlanCode;        // subscription
    billingCycle?: "month" | "year";
    lockType?: "env" | "perm";  // lock
    currentPlan: PlanCode;      // piano attuale dell'utente (per il prezzo LOCK)
  },
): Promise<PriceResult> {
  const { data: plans, error } = await admin.from("plans").select("*");
  if (error || !plans) throw new Error("plans_unavailable");

  let baseCents = 0;
  let label = "";
  if (opts.kind === "subscription") {
    const p = plans.find((x: any) => x.code === opts.planCode);
    if (!p) throw new Error("invalid_plan");
    baseCents = opts.billingCycle === "year" ? p.price_year_cents : p.price_month_cents;
    label = `Abbonamento ${p.name} (${opts.billingCycle === "year" ? "annuale" : "mensile"})`;
  } else {
    // Il prezzo del LOCK dipende dal piano ATTUALE dell'utente.
    const p = plans.find((x: any) => x.code === opts.currentPlan) ?? plans.find((x: any) => x.code === "free");
    baseCents = opts.lockType === "perm" ? p.perm_lock_cents : p.env_lock_cents;
    label = opts.lockType === "perm" ? "Sblocco PERMANENT_LOCK" : "Sblocco ENV_LOCK";
  }

  // Sconto a tempo applicabile (il migliore).
  const scope = opts.kind === "subscription" ? "plan" : "lock";
  const { data: discounts } = await admin
    .from("discounts")
    .select("*")
    .eq("is_active", true)
    .lte("starts_at", new Date().toISOString())
    .gte("ends_at", new Date().toISOString());

  let discountId: string | null = null;
  let best = 0;
  for (const d of discounts ?? []) {
    const scopeOk = d.applies_to === "all" || d.applies_to === scope;
    const planOk = !d.plan_code || d.plan_code === opts.planCode;
    if (scopeOk && planOk && d.percent > best) { best = d.percent; discountId = d.id; }
  }
  const amountCents = best > 0 ? Math.round(baseCents * (1 - best / 100)) : baseCents;
  return { baseCents, amountCents, discountId, label };
}

/**
 * Finalizza un ordine pagato (idempotente): marca paid, imposta il piano e
 * l'abbonamento per le subscription. I LOCK vengono solo registrati come pagati.
 */
export async function finalizeOrder(
  admin: SupabaseClient,
  orderId: string,
  extra?: { providerSubscriptionId?: string | null },
): Promise<void> {
  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) { console.log("[finalizeOrder] ordine non trovato:", orderId); throw new Error("order_not_found"); }
  if (order.status === "paid") { console.log("[finalizeOrder] già pagato:", orderId); return; }

  await admin.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);

  if (order.kind === "subscription") {
    const end = new Date();
    if (order.billing_cycle === "year") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

    const subId = extra?.providerSubscriptionId ?? order.provider_subscription_id ?? null;
    await admin.from("subscriptions").upsert({
      email: order.email,
      plan_code: order.plan_code,
      billing_cycle: order.billing_cycle,
      status: "active",
      provider: order.provider,
      current_period_end: end.toISOString(),
      provider_subscription_id: subId,
      auto_renew: !!order.is_recurring,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    });
    // registrations.plan resta la fonte di verità mirrorata alle app.
    await admin.from("registrations").update({ plan: order.plan_code }).eq("email", order.email);
    if (subId && subId !== order.provider_subscription_id) {
      await admin.from("orders").update({ provider_subscription_id: subId }).eq("id", orderId);
    }
    console.log("[finalizeOrder] piano aggiornato a", order.plan_code, "per", order.email, "| ricorrente:", !!order.is_recurring);
  }
  // kind === 'lock': registrato come pagato; l'emissione dell'unlock.lks è gestita
  // dal Tool-CLI dell'autore (fuori da questo flusso).
}

/**
 * Rinnovo ricorrente (chiamato dal webhook su invoice.paid / capture ricorrente):
 * estende il periodo dell'abbonamento e registra un ORDINE di rinnovo già pagato
 * (per lo storico). Idempotenza best-effort sul provider_subscription_id.
 */
export async function recordRenewal(
  admin: SupabaseClient,
  providerSubscriptionId: string,
  amountCents: number,
): Promise<void> {
  const { data: sub } = await admin.from("subscriptions")
    .select("*").eq("provider_subscription_id", providerSubscriptionId).maybeSingle();
  if (!sub) { console.log("[recordRenewal] subscription non trovata:", providerSubscriptionId); return; }

  const base = sub.current_period_end && new Date(sub.current_period_end) > new Date()
    ? new Date(sub.current_period_end) : new Date();
  if (sub.billing_cycle === "year") base.setFullYear(base.getFullYear() + 1);
  else base.setMonth(base.getMonth() + 1);

  await admin.from("subscriptions").update({
    status: "active", current_period_end: base.toISOString(), updated_at: new Date().toISOString(),
  }).eq("email", sub.email);
  await admin.from("registrations").update({ plan: sub.plan_code }).eq("email", sub.email);

  await admin.from("orders").insert({
    email: sub.email, kind: "subscription", plan_code: sub.plan_code, billing_cycle: sub.billing_cycle,
    base_cents: amountCents ?? 0, amount_cents: amountCents ?? 0, provider: sub.provider ?? "stripe",
    provider_subscription_id: providerSubscriptionId, is_recurring: true,
    status: "paid", paid_at: new Date().toISOString(),
  });
  console.log("[recordRenewal] rinnovo registrato per", sub.email, "→", base.toISOString());
}
