import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, ShieldCheck, Sparkles, ArrowLeft, Loader2, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Navbar } from "@/components/Navbar";
import { getPlan, fmtEuro, type PlanCode } from "@/lib/plans";
import { startCheckout } from "@/lib/checkout";

interface Discount { id: string; label: string; percent: number; applies_to: string; plan_code: string | null }

export function Checkout() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const lockParam = params.get("lock"); // "env" | "perm"
  const planParam = (params.get("plan") ?? "essential").toLowerCase() as PlanCode;
  const cycle = (params.get("cycle") === "month" ? "month" : "year") as "month" | "year";
  const kind: "subscription" | "lock" = lockParam ? "lock" : "subscription";

  const [provider, setProvider] = useState<"stripe" | "paypal">("stripe");
  const [busy, setBusy] = useState(false);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>("free");

  useEffect(() => {
    if (!user) { navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true }); return; }
    supabase.rpc("get_active_discounts").then(({ data }) => setDiscounts((data as Discount[] | null) ?? []));
    if (user.email) {
      supabase.from("registrations").select("plan").eq("email", user.email).maybeSingle()
        .then(({ data }) => setCurrentPlan(((data?.plan ?? "free").toLowerCase()) as PlanCode));
    }
  }, [user, navigate]);

  const summary = useMemo(() => {
    if (kind === "lock") {
      const p = getPlan(currentPlan);
      const isPerm = lockParam === "perm";
      const base = isPerm ? p.lock.permLock : p.lock.envLock;
      return { name: isPerm ? "Sblocco PERMANENT_LOCK" : "Sblocco ENV_LOCK", base, scope: "lock" as const };
    }
    const p = getPlan(planParam);
    const base = cycle === "year" ? p.priceYear : p.priceMonth;
    return { name: `Abbonamento ${p.name} · ${cycle === "year" ? "annuale" : "mensile"}`, base, scope: "plan" as const };
  }, [kind, lockParam, planParam, cycle, currentPlan]);

  const discount = useMemo(() => {
    let best: Discount | null = null;
    for (const d of discounts) {
      const scopeOk = d.applies_to === "all" || d.applies_to === summary.scope;
      const planOk = !d.plan_code || d.plan_code === planParam;
      if (scopeOk && planOk && (!best || d.percent > best.percent)) best = d;
    }
    return best;
  }, [discounts, summary.scope, planParam]);

  const finalPrice = discount ? summary.base * (1 - discount.percent / 100) : summary.base;

  const pay = async () => {
    setBusy(true);
    try {
      const res = await startCheckout({
        kind,
        planCode: kind === "subscription" ? planParam : undefined,
        billingCycle: kind === "subscription" ? cycle : undefined,
        lockType: kind === "lock" ? (lockParam as "env" | "perm") : undefined,
        provider,
      });
      window.location.href = res.url; // redirect a Stripe/PayPal o alla pagina simulata
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Avvio pagamento non riuscito.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Torna ai piani
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Checkout</h1>
        <p className="mt-1.5 text-muted-foreground">Rivedi l'ordine e scegli il metodo di pagamento.</p>

        {/* Riepilogo */}
        <div className="mt-8 rounded-xl border bg-card/60 p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="font-medium">{summary.name}</span>
            <span className={discount ? "text-sm text-muted-foreground line-through" : "font-semibold"}>{fmtEuro(summary.base)}</span>
          </div>
          {discount && (
            <div className="mt-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <Tag className="h-3.5 w-3.5" /> {discount.label} · −{discount.percent}%
              </span>
              <span className="text-lg font-bold text-success">{fmtEuro(Number(finalPrice.toFixed(2)))}</span>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
            <span className="text-sm text-muted-foreground">Totale</span>
            <span className="text-2xl font-extrabold tracking-tight">{fmtEuro(Number(finalPrice.toFixed(2)))}</span>
          </div>
        </div>

        {/* Provider */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <ProviderBtn active={provider === "stripe"} onClick={() => setProvider("stripe")} icon={<CreditCard className="h-4 w-4" />} label="Carta (Stripe)" />
          <ProviderBtn active={provider === "paypal"} onClick={() => setProvider("paypal")} icon={<Sparkles className="h-4 w-4" />} label="PayPal" />
        </div>

        <button
          onClick={pay}
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gradient px-5 py-3 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? "Reindirizzamento…" : `Paga ${fmtEuro(Number(finalPrice.toFixed(2)))}`}
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Pagamento sicuro. Se i provider non sono ancora configurati, il pagamento è simulato per completare il flusso.
        </p>
      </main>
    </div>
  );
}

function ProviderBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}
