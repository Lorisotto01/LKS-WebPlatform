import { supabase } from "./supabase";
import type { PlanCode } from "./plans";

export interface CheckoutInput {
  kind: "subscription" | "lock";
  planCode?: PlanCode;
  billingCycle?: "month" | "year";
  lockType?: "env" | "perm";
  provider?: "stripe" | "paypal";
  hwid?: string;
  recurring?: boolean;
}

export interface CheckoutResponse {
  url: string;
  provider: "stripe" | "paypal" | "simulated";
  orderId: string;
  amountCents?: number;
  /** Istante oltre il quale il tentativo di pagamento non è più valido. */
  expiresAt?: string;
}

/**
 * Estrae il messaggio d'errore vero dalla risposta di una Edge Function.
 *
 * `functions.invoke` non legge il corpo delle risposte non-2xx: espone solo
 * "Edge Function returned a non-2xx status code", inutile per l'utente. Il
 * corpo resta però disponibile in `error.context`, che è la Response originale.
 */
async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      const msg = body?.message ?? body?.error;
      if (typeof msg === "string" && msg) return msg;
    } catch {
      // corpo non JSON: si ricade sul messaggio generico
    }
  }
  const msg = (error as Error)?.message;
  return msg && !/non-2xx/i.test(msg) ? msg : fallback;
}

/** Avvia il checkout: crea l'ordine e ottiene la URL di pagamento (o simulata). */
export async function startCheckout(input: CheckoutInput): Promise<CheckoutResponse> {
  const { data, error } = await supabase.functions.invoke<CheckoutResponse>("create-checkout", { body: input });
  if (error) throw new Error(await functionErrorMessage(error, "Avvio pagamento non riuscito."));
  if (!data?.url) throw new Error("URL di pagamento non disponibile.");
  return data;
}

/** Finalizza un pagamento simulato (modalità senza provider reale). */
export async function simulatePayment(orderId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("simulate-payment", { body: { orderId } });
  if (error) throw new Error(await functionErrorMessage(error, "Pagamento simulato non riuscito."));
}

/**
 * Annulla un ordine ancora pending — chiamata al ritorno dal `cancel_url` del
 * provider. Non solleva: un ordine già pagato o già chiuso non è un errore.
 */
export async function cancelOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_my_order", { p_id: orderId });
  if (error) console.warn("[checkout] annullamento ordine non riuscito:", error.message);
}

export type OrderStatus = "pending" | "paid" | "failed" | "canceled";

/**
 * Stato REALE di un ordine lato UI.
 *
 * Il job `expire_stale_orders` gira ogni 5 minuti: fra la scadenza e il suo
 * passaggio il DB può ancora dire "pending". Qui lo deriviamo da `expires_at`
 * così la dashboard non mostra mai un ordine scaduto come ancora in corso.
 */
export function effectiveOrderStatus(order: { status: string; expires_at?: string | null }): OrderStatus {
  if (order.status === "pending" && order.expires_at && new Date(order.expires_at) < new Date()) return "failed";
  return order.status as OrderStatus;
}
