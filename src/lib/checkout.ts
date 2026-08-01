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
}

/** Avvia il checkout: crea l'ordine e ottiene la URL di pagamento (o simulata). */
export async function startCheckout(input: CheckoutInput): Promise<CheckoutResponse> {
  const { data, error } = await supabase.functions.invoke<CheckoutResponse>("create-checkout", { body: input });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error("URL di pagamento non disponibile.");
  return data;
}

/** Finalizza un pagamento simulato (modalità senza provider reale). */
export async function simulatePayment(orderId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("simulate-payment", { body: { orderId } });
  if (error) throw new Error(error.message);
}
