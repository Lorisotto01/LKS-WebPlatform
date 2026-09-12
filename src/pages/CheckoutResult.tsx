import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, LayoutDashboard, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Navbar } from "@/components/Navbar";
import { cancelOrder, effectiveOrderStatus, type OrderStatus } from "@/lib/checkout";

/**
 * Esito del checkout (success/cancel).
 *
 * - `success`: il provider ha incassato, ma la verità arriva dal webhook. Si
 *   attende qualche secondo che l'ordine passi a `paid`.
 * - `cancel`: l'utente è tornato indietro dalla pagina di pagamento. L'ordine
 *   viene chiuso SUBITO come `canceled`, senza aspettare la scadenza del TTL:
 *   altrimenti resterebbe "in corso" in dashboard per mezz'ora.
 */
export function CheckoutResult() {
  const [params] = useSearchParams();
  const status = params.get("status");
  const orderId = params.get("order");
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(status === "success");

  useEffect(() => {
    if (!orderId) return;

    if (status !== "success") {
      cancelOrder(orderId);
      return;
    }

    let tries = 0;
    let alive = true;
    const check = async () => {
      const { data } = await supabase.from("orders").select("status, expires_at").eq("id", orderId).maybeSingle();
      if (!alive) return;
      const eff = data ? effectiveOrderStatus(data) : null;
      setOrderStatus(eff);
      // Si smette di attendere appena l'esito è definitivo, o dopo ~9 secondi.
      if (eff === "paid" || eff === "failed" || eff === "canceled" || tries >= 5) { setLoading(false); return; }
      tries++; setTimeout(check, 1500); // attende il webhook
    };
    check();
    return () => { alive = false; };
  }, [status, orderId]);

  const paid = orderStatus === "paid";
  const failed = orderStatus === "failed" || orderStatus === "canceled";

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        {status === "success" ? (
          loading ? (
            <>
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
              <h1 className="mt-6 text-2xl font-bold">Confermiamo il pagamento…</h1>
              <p className="mt-2 text-muted-foreground">Attendere qualche secondo.</p>
            </>
          ) : paid ? (
            <>
              <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
              <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Pagamento completato</h1>
              <p className="mt-2 text-muted-foreground">Il tuo piano è stato aggiornato. Grazie!</p>
            </>
          ) : failed ? (
            <>
              <XCircle className="mx-auto h-14 w-14 text-destructive" />
              <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Pagamento non riuscito</h1>
              <p className="mt-2 text-muted-foreground">
                L'ordine è scaduto o è stato annullato e nessun addebito è stato effettuato. Ripeti l'acquisto per completarlo.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="mx-auto h-12 w-12 text-warning" />
              <h1 className="mt-6 text-2xl font-bold">In elaborazione</h1>
              <p className="mt-2 text-muted-foreground">
                Il pagamento risulta ricevuto ma non ancora confermato. Aggiorna la Dashboard tra poco.
              </p>
            </>
          )
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Pagamento annullato</h1>
            <p className="mt-2 text-muted-foreground">Nessun addebito effettuato. Puoi riprovare quando vuoi.</p>
          </>
        )}

        <div className="mt-8 flex justify-center gap-3">
          <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow hover:opacity-90">
            <LayoutDashboard className="h-4 w-4" /> Vai alla Dashboard
          </Link>
          <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg border border-input px-5 py-2.5 text-sm font-medium hover:bg-accent">
            Vedi i piani
          </Link>
        </div>
      </main>
    </div>
  );
}
