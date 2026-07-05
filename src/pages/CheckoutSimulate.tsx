import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useToast } from "@/components/ui/toast";
import { simulatePayment } from "@/lib/checkout";

/**
 * Pagina di pagamento SIMULATA: attiva quando le chiavi Stripe/PayPal non sono
 * configurate. Conferma l'ordine chiamando la function `simulate-payment`.
 */
export function CheckoutSimulate() {
  const [params] = useSearchParams();
  const orderId = params.get("order") ?? "";
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!orderId) { toast.error("Ordine non valido."); return; }
    setBusy(true);
    try {
      await simulatePayment(orderId);
      navigate(`/checkout/result?status=success&order=${orderId}`, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pagamento simulato non riuscito.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
          <FlaskConical className="h-3.5 w-3.5" /> Modalità simulata
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Conferma pagamento</h1>
        <p className="mt-2 text-muted-foreground">
          I provider di pagamento reali non sono ancora configurati. Conferma per completare l'ordine
          in modalità simulata e attivare il piano.
        </p>
        <button
          onClick={confirm}
          disabled={busy}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gradient px-5 py-3 text-sm font-semibold text-white shadow-glow hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? "Conferma…" : "Conferma pagamento simulato"}
        </button>
        <button onClick={() => navigate(`/checkout/result?status=cancel&order=${orderId}`)} className="mt-3 text-sm text-muted-foreground hover:text-foreground">
          Annulla
        </button>
      </main>
    </div>
  );
}
