import { useEffect, useState } from "react";
import { Download, Inbox, Loader2, CheckCircle2, AlertTriangle, TrendingUp, RefreshCw, FlaskConical } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

interface MonthPoint { month: string; total: number; unique_users: number }
interface ReportCounts { aperta: number; in_lavorazione: number; chiusa: number; totale: number }

export function AnalyticsTab() {
  const toast = useToast();
  const [months, setMonths] = useState<MonthPoint[]>([]);
  const [counts, setCounts] = useState<ReportCounts>({ aperta: 0, in_lavorazione: 0, chiusa: 0, totale: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [dl, rep] = await Promise.all([
      supabase.rpc("downloads_per_month"),
      supabase.from("reports").select("status"),
    ]);
    if (dl.error) toast.error("Caricamento download non riuscito.");
    setMonths((dl.data as MonthPoint[] | null) ?? []);

    const rows = (rep.data as { status: string }[] | null) ?? [];
    const c: ReportCounts = { aperta: 0, in_lavorazione: 0, chiusa: 0, totale: rows.length };
    for (const r of rows) if (r.status in c) (c as any)[r.status]++;
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const totalDownloads = months.reduce((s, m) => s + m.total, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
          <FlaskConical className="h-3.5 w-3.5" /> Sezione sperimentale
        </span>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Ricarica
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Download} label="Download totali" value={totalDownloads} tone="primary" />
        <Kpi icon={AlertTriangle} label="Segnalazioni aperte" value={counts.aperta} tone="warning" />
        <Kpi icon={Loader2} label="In lavorazione" value={counts.in_lavorazione} tone="primary" />
        <Kpi icon={CheckCircle2} label="Chiuse" value={counts.chiusa} tone="success" />
      </div>

      {/* Line chart download/mese */}
      <section className="rounded-xl border bg-card/60 p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-primary" /> Download per mese
          </h2>
          <span className="text-xs text-muted-foreground">{months.length} mesi</span>
        </div>
        {loading ? (
          <div className="mt-6 h-56 animate-pulse rounded-lg bg-card/40" />
        ) : months.length === 0 ? (
          <p className="mt-6 rounded-lg border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            Ancora nessun download registrato.
          </p>
        ) : (
          <LineChart points={months} />
        )}
      </section>

      {/* Stato segnalazioni */}
      <section className="rounded-xl border bg-card/60 p-6 shadow-card">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Inbox className="h-5 w-5 text-primary" /> Stato segnalazioni
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Distribuzione generale su {counts.totale} segnalazioni totali.</p>
        <div className="mt-4 space-y-3">
          <Bar label="Aperte" value={counts.aperta} total={counts.totale} cls="bg-warning" />
          <Bar label="In lavorazione" value={counts.in_lavorazione} total={counts.totale} cls="bg-primary" />
          <Bar label="Chiuse" value={counts.chiusa} total={counts.totale} cls="bg-success" />
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; tone: "primary" | "warning" | "success";
}) {
  const toneCls = tone === "warning" ? "bg-warning/10 text-warning" : tone === "success" ? "bg-success/10 text-success" : "bg-primary/10 text-primary";
  return (
    <div className="rounded-xl border bg-card/50 p-5 shadow-card">
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{label}</p>
    </div>
  );
}

function Bar({ label, value, total, cls }: { label: string; value: number; total: number; cls: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} <span className="text-muted-foreground">· {pct}%</span></span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-background/60">
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Grafico a linee SVG (nessuna dipendenza esterna). */
function LineChart({ points }: { points: MonthPoint[] }) {
  const W = 720, H = 240, PAD = 36;
  const max = Math.max(1, ...points.map((p) => p.total));
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = PAD + (points.length > 1 ? i * stepX : innerW / 2);
    const y = PAD + innerH - (p.total / max) * innerH;
    return { x, y, p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(PAD + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(PAD + innerH).toFixed(1)} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="mt-6 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Download per mese">
        <defs>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(248 90% 66%)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(248 90% 66%)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((g) => {
          const y = PAD + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="hsl(240 12% 22%)" strokeWidth="1" />
              <text x={PAD - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                {Math.round(g * max)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#lc-area)" />
        <path d={linePath} fill="none" stroke="hsl(248 90% 66%)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {coords.map((c) => (
          <g key={c.p.month}>
            <circle cx={c.x} cy={c.y} r="4" fill="hsl(240 16% 9%)" stroke="hsl(248 90% 66%)" strokeWidth="2" />
            <title>{`${c.p.month}: ${c.p.total} download`}</title>
            <text x={c.x} y={H - 12} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
              {c.p.month.slice(2)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
