import { useEffect, useState } from "react";
import { Users, Crown, RefreshCw, Wallet, Star, Percent, Plus, Trash2, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { getPlan, fmtEuro, PLANS } from "@/lib/plans";
import type { Database } from "@/types/database.types";

type Discount = Database["public"]["Tables"]["discounts"]["Row"];
interface OrdersSummary { paid_orders: number; revenue_cents: number }

interface Accounting { total: number; free: number; essential: number; pro: number }

/**
 * Tab Contabilità (v4.4.0): utenti registrati e ripartizione per piano
 * (Free/Essential/Pro) via RPC admin `admin_plan_accounting`, più una stima dei
 * ricavi mensili/annui ricorrenti in base ai prezzi di listino.
 */
export function AccountingTab() {
  const toast = useToast();
  const [data, setData] = useState<Accounting>({ total: 0, free: 0, essential: 0, pro: 0 });
  const [orders, setOrders] = useState<OrdersSummary>({ paid_orders: 0, revenue_cents: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [acc, ord] = await Promise.all([
      supabase.rpc("admin_plan_accounting"),
      supabase.rpc("admin_orders_summary"),
    ]);
    if (acc.error) toast.error("Caricamento contabilità non riuscito.");
    setData((acc.data as Accounting | null) ?? { total: 0, free: 0, essential: 0, pro: 0 });
    setOrders((ord.data as OrdersSummary | null) ?? { paid_orders: 0, revenue_cents: 0 });
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const ess = getPlan("essential");
  const pro = getPlan("pro");
  const mrr = data.essential * ess.priceMonth + data.pro * pro.priceMonth;
  const arr = data.essential * ess.priceYear + data.pro * pro.priceYear;
  const paying = data.essential + data.pro;
  const conversion = data.total > 0 ? Math.round((paying / data.total) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Wallet className="h-3.5 w-3.5" /> Contabilità
        </span>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Ricarica
        </Button>
      </div>

      {/* Utenti per piano */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Utenti registrati" value={data.total} tone="#6C63FF" loading={loading} />
        <Kpi icon={Crown} label="Piano Free" value={data.free} tone="#8A94A6" loading={loading} />
        <Kpi icon={Crown} label="Piano Essential" value={data.essential} tone="#F59E0B" loading={loading} />
        <Kpi icon={Crown} label="Piano Pro" value={data.pro} tone="#A78BFA" loading={loading} />
      </div>

      {/* Ripartizione grafica */}
      <section className="rounded-xl border bg-card/60 p-6 shadow-card">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Star className="h-5 w-5 text-primary" /> Ripartizione utenti
        </h2>
        <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-background/60">
          <Bar value={data.free} total={data.total} color="#8A94A6" />
          <Bar value={data.essential} total={data.total} color="#F59E0B" />
          <Bar value={data.pro} total={data.total} color="#A78BFA" />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Legend color="#8A94A6" label={`Free · ${pct(data.free, data.total)}%`} />
          <Legend color="#F59E0B" label={`Essential · ${pct(data.essential, data.total)}%`} />
          <Legend color="#A78BFA" label={`Pro · ${pct(data.pro, data.total)}%`} />
          <span className="ml-auto">Conversione a pagamento: <strong className="text-foreground">{conversion}%</strong></span>
        </div>
      </section>

      {/* Ricavi ricorrenti stimati */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={Wallet} label="MRR stimato" value={fmtEuro(Number(mrr.toFixed(2)))} tone="#10B981" loading={loading} raw />
        <Kpi icon={Wallet} label="ARR stimato" value={fmtEuro(Number(arr.toFixed(2)))} tone="#10B981" loading={loading} raw />
        <Kpi icon={Users} label="Utenti paganti" value={paying} tone="#6C63FF" loading={loading} />
      </div>
      <p className="text-xs text-muted-foreground">
        Le stime MRR/ARR usano i prezzi di listino (Essential {fmtEuro(ess.priceMonth)}/mese, Pro {fmtEuro(pro.priceMonth)}/mese)
        applicati al numero di utenti per piano; non tengono conto di sconti o cicli di fatturazione effettivi.
      </p>

      {/* Ordini realmente incassati */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi icon={ShoppingCart} label="Ordini pagati" value={orders.paid_orders} tone="#6C63FF" loading={loading} />
        <Kpi icon={Wallet} label="Incassato totale" value={fmtEuro(Number((orders.revenue_cents / 100).toFixed(2)))} tone="#10B981" loading={loading} raw />
      </div>

      {/* Sconti a tempo */}
      <DiscountsManager />
    </div>
  );
}

function DiscountsManager() {
  const toast = useToast();
  const [list, setList] = useState<Discount[]>([]);
  const [label, setLabel] = useState("");
  const [percent, setPercent] = useState(15);
  const [appliesTo, setAppliesTo] = useState<"plan" | "lock" | "all">("plan");
  const [planCode, setPlanCode] = useState<string>("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("discounts").select("*").order("created_at", { ascending: false });
    setList((data as Discount[] | null) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const create = async () => {
    if (!label.trim() || !endsAt) { toast.error("Inserisci etichetta e data di fine."); return; }
    setBusy(true);
    const { error } = await supabase.from("discounts").insert({
      label: label.trim(), percent, applies_to: appliesTo,
      plan_code: planCode || null, ends_at: new Date(endsAt).toISOString(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Sconto creato."); setLabel(""); setEndsAt(""); load();
  };

  const toggle = async (d: Discount) => {
    const { error } = await supabase.from("discounts").update({ is_active: !d.is_active }).eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const now = Date.now();
  return (
    <section className="rounded-xl border bg-card/60 p-6 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Percent className="h-5 w-5 text-primary" /> Sconti a tempo
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Crea offerte a scadenza per invogliare l'upgrade. Vengono applicate automaticamente al checkout.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input className="rounded-lg border border-input bg-background/60 px-3 py-2 text-sm lg:col-span-2" placeholder="Etichetta (es. Black Friday)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="flex items-center gap-2 rounded-lg border border-input bg-background/60 px-3 py-2 text-sm">
          <input type="number" min={1} max={90} className="w-full bg-transparent outline-none" value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
          <span className="text-muted-foreground">%</span>
        </div>
        <select className="rounded-lg border border-input bg-background/60 px-3 py-2 text-sm" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as "plan" | "lock" | "all")}>
          <option value="plan">Piani</option>
          <option value="lock">LOCK</option>
          <option value="all">Tutto</option>
        </select>
        <select className="rounded-lg border border-input bg-background/60 px-3 py-2 text-sm" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
          <option value="">Tutti i piani</option>
          {PLANS.filter((p) => p.code !== "free").map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <input type="datetime-local" className="rounded-lg border border-input bg-background/60 px-3 py-2 text-sm" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        <button onClick={create} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-glow hover:opacity-90 disabled:opacity-60">
          <Plus className="h-4 w-4" /> Crea sconto
        </button>
      </div>

      <div className="mt-6 space-y-2">
        {list.length === 0 ? (
          <p className="rounded-lg border bg-card/40 p-4 text-sm text-muted-foreground">Nessuno sconto configurato.</p>
        ) : list.map((d) => {
          const active = d.is_active && new Date(d.starts_at).getTime() <= now && new Date(d.ends_at).getTime() >= now;
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/50 px-4 py-3 text-sm">
              <span className="font-semibold text-success">−{d.percent}%</span>
              <span className="font-medium">{d.label}</span>
              <span className="text-xs text-muted-foreground">{d.applies_to}{d.plan_code ? ` · ${d.plan_code}` : ""}</span>
              <span className="text-xs text-muted-foreground">fino al {new Date(d.ends_at).toLocaleString("it-IT")}</span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                {active ? "attivo" : "inattivo"}
              </span>
              <button onClick={() => toggle(d)} className="btn-icon text-muted-foreground hover:text-destructive" title={d.is_active ? "Disattiva" : "Riattiva"}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function pct(v: number, total: number) { return total > 0 ? Math.round((v / total) * 100) : 0; }

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  const w = total > 0 ? (value / total) * 100 : 0;
  if (w <= 0) return null;
  return <span style={{ width: `${w}%`, background: color }} className="h-full" title={`${value}`} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

function Kpi({
  icon: Icon, label, value, tone, loading, raw,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; tone: string; loading?: boolean; raw?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card/60 p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: `${tone}1F`, color: tone }}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
          <p className="text-2xl font-bold tracking-tight">
            {loading ? "…" : raw ? value : (value as number)}
          </p>
        </div>
      </div>
    </div>
  );
}
