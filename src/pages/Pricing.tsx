import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Sparkles, ShieldCheck, ArrowRight, Tag, HelpCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PLANS, fmtEuro, type Plan, type PlanCode } from "@/lib/plans";
import { supabase } from "@/lib/supabase";
import { cn } from "@/utils/cn";
import { useSeo } from "@/lib/seo";

type Cycle = "month" | "year";

interface ActiveDiscount { id: string; label: string; percent: number; applies_to: string; plan_code: string | null }

export function Pricing() {
  useSeo({
    title: "Prezzi — SecureLocalShare | Free, Essential e Pro",
    description:
      "Piani SecureLocalShare: inizia gratis, passa a Essential o Pro per più utenti, spazio e sconti sugli sblocchi di licenza. Nessun vincolo, cambi o disdici quando vuoi.",
    path: "/pricing",
  });
  const [cycle, setCycle] = useState<Cycle>("month");
  const [discounts, setDiscounts] = useState<ActiveDiscount[]>([]);

  useEffect(() => {
    supabase.rpc("get_active_discounts").then(({ data }) => setDiscounts((data as ActiveDiscount[] | null) ?? []));
  }, []);

  /** Miglior sconto % applicabile a un piano (scope 'plan'/'all'). */
  const discountFor = (code: PlanCode): ActiveDiscount | null => {
    let best: ActiveDiscount | null = null;
    for (const d of discounts) {
      const scopeOk = d.applies_to === "all" || d.applies_to === "plan";
      const planOk = !d.plan_code || d.plan_code === code;
      if (scopeOk && planOk && (!best || d.percent > best.percent)) best = d;
    }
    return best;
  };

  return (
    <div className="min-h-screen">
      <Navbar
        links={[
          { label: "Funzionalità", href: "/funzionalita" },
          { label: "Sicurezza", href: "/sicurezza" },
          { label: "Prezzi", href: "/pricing" },
          { label: "FAQ", href: "/faq" },
          // { label: "Recensioni", href: "/recensioni" }, // Nascosto finché non ci sono recensioni reali (task SEO WebPlatform)
          { label: "Chi sono", href: "/chi-sono" },
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[320px] bg-hero-glow" />
        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Tag className="h-3.5 w-3.5 text-primary" /> Prezzi
          </span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Scegli il piano <span className="text-brand-gradient">giusto per te</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Inizia gratis e passa a un piano superiore quando ti serve più spazio, più utenti o gli
            sconti sui blocchi di licenza. Nessun vincolo: cambi o disdici quando vuoi.
          </p>
          <div>
             <Link
            to="/sicurezza#tipi-di-blocco"
            title="Cosa sono ENV_LOCK e PERMANENT_LOCK?"
            className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5 text-primary" /> Cosa sono i blocchi ENV_LOCK / PERMANENT_LOCK?
          </Link>
          </div>
         

          {/* Toggle mensile / annuale */}
          <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1">
            <CycleButton active={cycle === "month"} onClick={() => setCycle("month")}>
              Mensile
            </CycleButton>
            <CycleButton active={cycle === "year"} onClick={() => setCycle("year")}>
              Annuale
              <span className="ml-1.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                risparmi
              </span>
            </CycleButton>
          </div>
        </div>
      </section>

      {/* Cards */}
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid items-start gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard key={p.code} plan={p} cycle={cycle} discount={discountFor(p.code)} />
          ))}
        </div>

        {/* Tabella sconti LOCK */}
        <LockTable />

        {/* CTA finale */}
        <div className="mt-16 rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Hai dubbi sul piano da scegliere?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Puoi iniziare gratis oggi stesso: crei l'account, scarichi l'app e passi a Essential o Pro
            in qualsiasi momento dalla tua Dashboard.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
          >
            Inizia gratis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}

function CycleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function PlanCard({ plan, cycle, discount }: { plan: Plan; cycle: Cycle; discount?: { label: string; percent: number } | null }) {
  const free = plan.code === "free";
  const listPrice = cycle === "month" ? plan.priceMonth : plan.priceYear;
  const hasDiscount = !free && !!discount && discount.percent > 0;
  const price = hasDiscount ? listPrice * (1 - discount!.percent / 100) : listPrice;
  const suffix = free ? "" : cycle === "month" ? "/mese" : "/anno";

  // Prezzo mensile equivalente sul piano annuale (marketing).
  const perMonthOnYear = !free && cycle === "year" ? price / 12 : null;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-6 shadow-card transition-transform",
        plan.recommended
          ? "border-primary/60 shadow-glow lg:-translate-y-2"
          : "border-border/60"
      )}
    >
      {plan.recommended && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1 text-[11px] font-semibold text-white shadow-glow">
          <Sparkles className="h-3.5 w-3.5" /> Consigliato
        </span>
      )}

      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold tracking-tight">{plan.name}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

      {hasDiscount && (
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">−{discount!.percent}% {discount!.label}</span>
          <span className="text-sm text-muted-foreground line-through">{fmtEuro(listPrice)}{suffix}</span>
        </div>
      )}
      <div className={hasDiscount ? "mt-1 flex items-end gap-1" : "mt-5 flex items-end gap-1"}>
        <span className="text-4xl font-extrabold tracking-tight">{fmtEuro(Number(price.toFixed(2)))}</span>
        {suffix && <span className="pb-1 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      <p className="mt-1 h-4 text-xs text-muted-foreground">
        {perMonthOnYear != null ? `≈ ${fmtEuro(Number(perMonthOnYear.toFixed(2)))}/mese fatturato annualmente` : ""}
      </p>

      <Link
        to={free ? "/register" : `/checkout?plan=${plan.code}&cycle=${cycle}`}
        className={cn(
          "mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity",
          plan.recommended || !free
            ? "bg-brand-gradient text-white shadow-glow hover:opacity-90"
            : "border border-input bg-transparent hover:bg-accent"
        )}
      >
        {free ? "Inizia gratis" : `Passa a ${plan.name}`}
      </Link>

      <ul className="mt-6 space-y-2.5">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-lg border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Sblocco licenza
        </div>
        {/* Rassicurazione PRIMA delle cifre: il costo di sblocco non è una perdita di dati. */}
        <p className="mt-1.5 leading-relaxed">
          Il tuo vault e i tuoi dati restano <span className="text-foreground">sempre intatti</span>:
          il blocco è una difesa anti-bruteforce, non una perdita. Solo se serve rigenerare la licenza
          c'è un costo una tantum.{" "}
          <Link to="/sicurezza#tipi-di-blocco" className="font-medium text-primary hover:underline">
            Come funziona
          </Link>
        </p>
        <div className="mt-2 flex justify-between">
          <span>ENV_LOCK</span>
          <span className="font-mono">{fmtEuro(plan.lock.envLock)}</span>
        </div>
        <div className="mt-0.5 flex justify-between">
          <span>PERMANENT_LOCK</span>
          <span className="font-mono">{fmtEuro(plan.lock.permLock)}</span>
        </div>
      </div>
    </div>
  );
}

function LockTable() {
  return (
    <div className="mt-16">
      <div className="mb-4 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Sconti sui blocchi di licenza</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
          Prima di tutto la cosa importante: il <span className="text-foreground">vault e i suoi dati
          restano sempre al sicuro e intatti</span>. Il blocco è una misura di sicurezza
          anti-bruteforce, non una perdita di dati. In caso di{" "}
          <span className="font-mono text-warning">ENV_LOCK</span> o{" "}
          <span className="font-mono text-destructive">PERMANENT_LOCK</span> lo sblocco firmato ha un
          costo una tantum che si riduce con il tuo piano.{" "}
          <Link to="/sicurezza#tipi-di-blocco" className="font-medium text-primary hover:underline">
            Scopri come funzionano i blocchi
          </Link>
          .
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">Piano</th>
              <th className="px-4 py-3 text-right font-medium">ENV_LOCK</th>
              <th className="px-4 py-3 text-right font-medium">PERMANENT_LOCK</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((p) => (
              <tr key={p.code} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono">{fmtEuro(p.lock.envLock)}</span>
                  {p.lock.envDiscountPct > 0 && (
                    <span className="ml-2 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                      −{p.lock.envDiscountPct}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono">{fmtEuro(p.lock.permLock)}</span>
                  {p.lock.permDiscountPct > 0 && (
                    <span className="ml-2 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                      −{p.lock.permDiscountPct}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
