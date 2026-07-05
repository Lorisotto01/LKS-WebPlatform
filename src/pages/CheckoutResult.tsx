import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, LayoutDashboard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Navbar } from "@/components/Navbar";

/** Esito del checkout (success/cancel). In success verifica lo stato dell'ordine. */
export function CheckoutResult() {
  const [params] = useSearchParams();
  const status = params.get("status");
  const orderId = params.get("order");
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(status === "success");

  useEffect(() => {
    if (status !== "success" || !orderId) return;
    let tries = 0;
    const check = async () => {
      const { data } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
      setOrderStatus(data?.status ?? null);
      if (data?.status === "paid" || tries >= 5) { setLoading(false); return; }
      tries++; setTimeout(check, 1500); // attende il webhook
    };
    check();
  }, [status, orderId]);

  const paid = orderStatus === "paid";

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
          ) : (
            <>
              <Loader2 className="mx-auto h-12 w-12 text-warning" />
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
