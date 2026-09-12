import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  Download, Sparkles, Clock, RefreshCw, Mail, User, MonitorDown, Trash2, Crown,
  ArrowUpRight, Receipt, KeyRound, Repeat, RotateCcw, Package, ArrowRight, Check,
  FileText, Star, UserCog,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Navbar } from "@/components/Navbar";
import { ActivationCard } from "@/components/ActivationCard";
import { ReviewForm } from "@/components/ReviewForm";
import { Button } from "@/components/ui/button";
import { ensureActivation } from "@/lib/activations";
import { changelogAnchor } from "@/lib/changelog";
import type { Release, Download as DownloadRow, Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type UnlockFile = Database["public"]["Tables"]["unlock_files"]["Row"];
type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
import { getPlan, fmtEuro, type PlanCode } from "@/lib/plans";
import { effectiveOrderStatus, releaseDownloadUrl, type OrderStatus } from "@/lib/checkout";

const dateIT = (v: string | number | Date) =>
  new Date(v).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

/** Prime `max` righe delle note di rilascio, ripulite dal bullet markdown. */
function noteLines(notes: string | null, max: number): string[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [releases, setReleases] = useState<Release[]>([]);
  const [history, setHistory] = useState<DownloadRow[]>([]);
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState<PlanCode>("free");
  const [sub, setSub] = useState<Subscription | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [unlocks, setUnlocks] = useState<Record<string, UnlockFile>>({});

  const load = async () => {
    setLoading(true);
    const [rel, dl, reg] = await Promise.all([
      supabase.from("releases").select("*").eq("is_active", true).order("release_date", { ascending: false }),
      supabase.from("downloads").select("*").order("downloaded_at", { ascending: false }).limit(10),
      user?.email
        ? supabase.from("registrations").select("plan").eq("email", user.email).maybeSingle()
        : Promise.resolve({ data: null, error: null } as { data: { plan: string } | null; error: null }),
    ]);
    if (rel.error) toast.error("Caricamento release non riuscito.");
    setReleases(rel.data ?? []);
    setHistory(dl.data ?? []);
    const pc = (reg.data?.plan ?? "free").toLowerCase();
    setPlan((["free", "essential", "pro"].includes(pc) ? pc : "free") as PlanCode);
    if (user?.email) {
      const [ord, sb, uf] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("subscriptions").select("*").maybeSingle(),
        supabase.from("unlock_files").select("*"),
      ]);
      setOrders((ord.data as Order[] | null) ?? []);
      setSub((sb.data as Subscription | null) ?? null);
      const um: Record<string, UnlockFile> = {};
      for (const u of (uf.data as UnlockFile[] | null) ?? []) um[u.order_id] = u;
      setUnlocks(um);
    }
    // GDPR (C2): il nome viene letto solo da user_metadata (niente più query a registrations.name).
    setName(
      (user?.user_metadata?.name as string | undefined) ??
        user?.email?.split("@")[0] ??
        ""
    );
    setLoading(false);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  const download = async (r: Release) => {
    if (!user?.email) return;
    setDownloadingId(r.id);
    try {
      // 1. Link firmato emesso dalla Edge Function con la service_role, dopo la verifica della
      //    sessione: il bucket delle release non e' piu' leggibile dai client (v4.8.2, rilievo M6).
      //    La function registra da se' il download e aggiorna last_download_at.
      const signedUrl = await releaseDownloadUrl(r.version);

      // 2. Ensure an activation token exists for this user (bound later by the DesktopApp).
      await ensureActivation(user.email, r.version);

      // 3. Trigger the download.
      window.location.href = signedUrl;
      toast.success(`Download di ${r.version} avviato.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download non riuscito.");
    } finally {
      setDownloadingId(null);
    }
  };

  // GDPR (C2) — diritto all'oblio: cancella i dati dell'utente e fa logout.
  const deleteAccount = async () => {
    if (
      !confirm(
        "Eliminare definitivamente il tuo account e tutti i dati associati (download, attivazioni)? L'operazione è irreversibile."
      )
    )
      return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      toast.success("Account eliminato. I tuoi dati sono stati rimossi.");
      await signOut();
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eliminazione account non riuscita.");
    } finally {
      setDeleting(false);
    }
  };

  const latest = releases.find((r) => r.is_active) ?? releases[0];
  const previous = releases.filter((r) => r.id !== latest?.id);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-6 px-3 py-6 sm:px-6 sm:py-10">
        {/* ============ 1 — Benvenuto ============ */}
        <WelcomeHero name={name} />

        {/* ============ 2 — Versioni disponibili ============ */}
        <SectionCard
          icon={Package}
          title="Versioni disponibili"
          subtitle="Scarica l'ultima versione dell'applicazione e inizia subito."
          action={{ label: "Tutte le note", to: "/changelog" }}
        >
          {loading ? (
            <ReleasesSkeleton />
          ) : !latest ? (
            <p className="rounded-lg border bg-background/40 p-6 text-center text-sm text-muted-foreground">
              Nessuna release disponibile al momento.
            </p>
          ) : (
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <LatestRelease
                release={latest}
                busy={downloadingId === latest.id}
                onDownload={() => download(latest)}
              />
              <PreviousReleases
                releases={previous}
                downloadingId={downloadingId}
                onDownload={download}
              />
            </div>
          )}
        </SectionCard>

        {/* ============ 3 — Piano attuale ============ */}
        <PlanBanner
          plan={plan}
          sub={sub}
          onUpgrade={() => navigate("/pricing")}
          onRenew={() => navigate(`/checkout?plan=${plan}&cycle=${sub?.billing_cycle === "year" ? "year" : "month"}`)}
        />

        {/* ============ 4 — Ordini · Account ============ */}
        {/* min-w-0: senza, le celle della griglia non scendono sotto la loro
            min-content e a 260px la pagina scrollerebbe in orizzontale. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <MyOrders orders={orders} unlocks={unlocks} onChanged={load} />

          <div className="min-w-0 space-y-6">
            <SectionCard
              icon={UserCog}
              title="Dati account"
              subtitle="Le tue informazioni e impostazioni."
            >
              {/* space-y: ActivationCard può non renderizzare nulla (licenza in caricamento). */}
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <AccountField icon={Mail} label="Email" value={user?.email ?? "-"} />
                  <AccountField icon={User} label="Nome completo" value={name || "-"} />
                </div>

                {/* Attivazione dispositivo: token e device collegati. */}
                <ActivationCard />

                <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                  <div className="flex min-w-0 gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-destructive">Elimina account</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        Rimuove definitivamente i tuoi dati (registrazione, download, attivazioni).
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deleteAccount}
                    disabled={deleting}
                    className="w-full shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting ? "Eliminazione…" : "Elimina account"}
                  </Button>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        {/* ============ 5 — Download e recensioni ============ */}
        <SectionCard
          icon={Star}
          title="Versioni scaricate e recensioni"
          subtitle="Le versioni che hai scaricato e cosa ne pensi."
          meta={`${history.length} · ultimi 10`}
        >
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <DownloadHistory history={history} latest={latest} onRedownload={download} />
            </div>
            <div className="min-w-0">
              <ReviewForm versions={releases.map((r) => r.version)} defaultVersion={latest?.version} />
            </div>
          </div>
        </SectionCard>
      </main>
    </div>
  );
}

/* ================================================================== *
 * Struttura
 * ================================================================== */

/**
 * Fascia standard della dashboard: intestazione con icona, titolo, sottotitolo
 * e — a destra — un link o un contatore. Il contenuto resta libero.
 */
function SectionCard({
  icon: Icon, title, subtitle, action, meta, children, className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  action?: { label: string; to: string };
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border bg-card/50 p-3.5 shadow-card sm:p-5 ${className ?? ""}`}>
      {/* Sotto sm meta e link scendono su una riga propria: a 260px il titolo
          resterebbe altrimenti schiacciato in una colonna di poche lettere. */}
      <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 basis-32">
          <h2 className="break-words text-base font-semibold sm:text-lg">{title}</h2>
          {subtitle && <p className="mt-0.5 break-words text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
        </div>
        {(meta || action) && (
          <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
            {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
            {action && (
              <Link
                to={action.to}
                className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary transition-opacity hover:opacity-80"
              >
                {action.label} <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

/** Hero di benvenuto: saluto, riepilogo e decoro costruito con la palette. */
function WelcomeHero({ name }: { name: string }) {
  return (
    <section className="bg-hero-glow relative overflow-hidden rounded-xl border bg-card/50 p-4 shadow-card sm:p-8">
      <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary">
            Ciao{name ? `, ${name}` : ""} <span className="align-middle">&#128075;</span>
          </p>
          <h1 className="mt-1 break-words text-xl font-extrabold tracking-tight sm:text-3xl">
            Benvenuto nella tua dashboard
          </h1>
          <p className="mt-2 max-w-xl break-words text-xs text-muted-foreground sm:text-sm">
            Gestisci il tuo piano, i pagamenti, le versioni e tutto quello che riguarda il tuo
            account SecureLocalShare.
          </p>
        </div>
        <HeroDecor />
      </div>
    </section>
  );
}

/** Decoro: pila isometrica + freccia di download, solo tinte della palette. */
function HeroDecor() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 140"
      className="hidden h-32 w-36 shrink-0 md:block lg:h-40 lg:w-44"
    >
      <defs>
        <linearGradient id="dashDecorA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(252 90% 68%)" />
          <stop offset="1" stopColor="hsl(244 92% 60%)" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="124" rx="56" ry="9" fill="hsl(248 90% 60% / 0.14)" />
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={0.35 + i * 0.28} transform={`translate(0 ${i * -20})`}>
          <path d="M80 74 L128 98 L80 122 L32 98 Z" fill="url(#dashDecorA)" />
          <path d="M80 74 L128 98 L80 122 L32 98 Z" fill="none" stroke="hsl(252 95% 80% / 0.5)" strokeWidth="1.5" />
        </g>
      ))}
      <g stroke="hsl(252 95% 80%)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M80 8 V40" />
        <path d="M68 30 L80 42 L92 30" />
      </g>
    </svg>
  );
}

/* ================================================================== *
 * Versioni
 * ================================================================== */

/** Card in evidenza dell'ultima versione: download, data e link alle note. */
function LatestRelease({
  release: r, busy, onDownload,
}: { release: Release; busy: boolean; onDownload: () => void }) {
  const lines = noteLines(r.notes, 4);
  return (
    <article className="border-brand-l flex min-w-0 flex-col rounded-lg rounded-l-md border bg-background/40 p-3.5 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-2.5 py-1 text-[11px] font-medium text-white">
          <Sparkles className="h-3.5 w-3.5 shrink-0" /> Ultima versione
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MonitorDown className="h-3.5 w-3.5 shrink-0" /> Windows 10/11 · 64-bit
        </span>
      </div>

      <p className="mt-3 break-all font-mono text-2xl font-bold tracking-tight sm:text-3xl">{r.version}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0" /> Rilasciata il {dateIT(r.release_date)}
      </p>

      {lines.length > 0 && (
        <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto pr-1 text-xs sm:text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 break-words text-muted-foreground">{l}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
        <Button
          onClick={onDownload}
          disabled={busy}
          className="w-full bg-brand-gradient shadow-glow hover:opacity-90 sm:w-auto"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="truncate">{busy ? "Preparazione…" : "Scarica"}</span>
        </Button>
        <Link
          to={changelogAnchor(r.version)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity hover:opacity-80"
        >
          <FileText className="h-3.5 w-3.5 shrink-0" /> Note di rilascio <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="mt-[0.2em] h-3 w-3 shrink-0" />
        <span className="min-w-0">Il link resta valido 10 minuti dopo il click.</span>
      </p>
    </article>
  );
}

/**
 * Versioni precedenti su linea temporale verticale. L'elenco può essere lungo:
 * altezza limitata e scroll interno, così la fascia non cresce all'infinito.
 */
function PreviousReleases({
  releases, downloadingId, onDownload,
}: { releases: Release[]; downloadingId: string | null; onDownload: (r: Release) => void }) {
  if (releases.length === 0) {
    return (
      <div className="grid place-items-center rounded-lg border bg-background/30 p-6 text-center text-sm text-muted-foreground">
        Nessuna versione precedente.
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-background/30 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Versioni precedenti</h3>
        <span className="text-[11px] text-muted-foreground">{releases.length} · scorri</span>
      </div>
      {/* pl-2: lo scroll ritaglia anche in orizzontale, serve spazio per i pallini della timeline. */}
      <div className="max-h-[22rem] overflow-y-auto pl-2 pr-1">
        <ol className="relative space-y-3 border-l border-border/60 pl-4 sm:pl-5">
          {releases.map((r) => (
            <li key={r.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[1.32rem] top-3 h-3 w-3 rounded-full border-2 border-primary bg-background sm:-left-[1.57rem]"
              />
              <div className="min-w-0 rounded-lg border bg-card/50 p-2.5 transition-colors hover:border-primary/40 sm:p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-all font-mono text-sm font-semibold">{r.version}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    {dateIT(r.release_date)}
                  </span>
                </div>
                {noteLines(r.notes, 2).length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {noteLines(r.notes, 2).map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                        <span className="min-w-0 break-words">{l}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(r)}
                    disabled={downloadingId === r.id}
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" /> Scarica
                  </Button>
                  <Link
                    to={changelogAnchor(r.version)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
                  >
                    Note di rilascio <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Piano
 * ================================================================== */

/** Fascia del piano attivo: caratteristiche a sinistra, upsell/rinnovo a destra. */
function PlanBanner({
  plan, sub, onUpgrade, onRenew,
}: { plan: PlanCode; sub: Subscription | null; onUpgrade: () => void; onRenew: () => void }) {
  const p = getPlan(plan);
  const isFree = plan === "free";
  const tone = plan === "pro" ? "#A78BFA" : plan === "essential" ? "#F59E0B" : "#8A94A6";
  const renewal = sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("it-IT") : null;

  return (
    <section className="bg-hero-glow relative overflow-hidden rounded-xl border bg-card/50 shadow-card">
      <div className="relative grid gap-4 p-3.5 sm:p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
        {/* Piano attivo */}
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
              style={{ background: `${tone}1F`, color: tone }}
            >
              <Crown className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground sm:text-sm">Piano attuale</p>
              <p className="truncate text-lg font-bold tracking-tight sm:text-xl" style={{ color: tone }}>
                {p.name}
              </p>
            </div>
            <span className="ml-auto shrink-0 text-right font-mono text-[11px] text-muted-foreground sm:text-xs">
              {isFree ? "Gratis" : (
                <>
                  {fmtEuro(p.priceMonth)}/mese
                  <span className="block">{fmtEuro(p.priceYear)}/anno</span>
                </>
              )}
            </span>
          </div>

          <ul className="mt-4 grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
            {p.highlights.slice(0, 4).map((h) => (
              <li key={h} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                <span className="min-w-0 break-words text-muted-foreground">{h}</span>
              </li>
            ))}
          </ul>

          {!isFree && renewal && (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {sub?.auto_renew && !sub?.cancel_at_period_end
                ? <>Rinnovo automatico il <strong className="text-foreground">{renewal}</strong></>
                : <>Scade il <strong className="text-foreground">{renewal}</strong></>}
            </p>
          )}
        </div>

        {/* Upsell / gestione */}
        <div className="flex min-w-0 flex-col justify-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3.5 sm:p-4">
          <div className="flex items-start gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
              style={{ background: `${tone}1F`, color: tone }}
            >
              <Crown className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">
                {isFree ? "Hai bisogno di più?" : "Gestisci il tuo piano"}
              </p>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {isFree
                  ? "Sblocca tutte le funzionalità e porta la tua sicurezza al livello successivo."
                  : "Cambia piano quando vuoi oppure rinnova in anticipo."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onUpgrade}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-gradient px-3 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
            >
              {isFree ? <Sparkles className="h-4 w-4 shrink-0" /> : <ArrowUpRight className="h-4 w-4 shrink-0" />}
              <span className="truncate">{isFree ? "Passa a Pro" : "Cambia piano"}</span>
            </button>
            {!isFree && (
              <button
                onClick={onRenew}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Repeat className="h-4 w-4 shrink-0" /> <span className="truncate">Rinnova ora</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== *
 * Ordini
 * ================================================================== */

/**
 * Aspetto del badge di stato. `pending` resta giallo solo finché il tentativo è
 * davvero in corso: scaduto il TTL diventa rosso (vedi effectiveOrderStatus).
 */
const ORDER_BADGE: Record<OrderStatus, { label: string; className: string }> = {
  paid:     { label: "pagato",     className: "bg-success/15 text-success" },
  pending:  { label: "in attesa",  className: "bg-warning/15 text-warning" },
  failed:   { label: "non riuscito", className: "bg-destructive/15 text-destructive" },
  canceled: { label: "annullato",  className: "bg-muted text-muted-foreground" },
};

/** URL di /checkout che ripete lo stesso acquisto di un ordine non andato a buon fine. */
function retryHref(o: Order): string {
  return o.kind === "subscription"
    ? `/checkout?plan=${o.plan_code ?? "essential"}&cycle=${o.billing_cycle ?? "year"}`
    : `/checkout?lock=${o.lock_type ?? "env"}${o.hwid ? `&hwid=${encodeURIComponent(o.hwid)}` : ""}`;
}

function MyOrders({ orders, unlocks, onChanged }: { orders: Order[]; unlocks: Record<string, UnlockFile>; onChanged: () => void }) {
  const eur = (c: number) => `${(c / 100).toFixed(2)}€`;
  const desc = (o: Order) =>
    o.kind === "subscription"
      ? `${o.plan_code ?? ""} · ${o.billing_cycle === "year" ? "annuale" : "mensile"}`
      : o.lock_type === "perm" ? "PERMANENT_LOCK" : "ENV_LOCK";

  // Il job di scadenza gira ogni 5 minuti: questo tick fa passare da solo a
  // rosso un ordine che scade mentre la dashboard è aperta.
  const [, tick] = useState(0);
  useEffect(() => {
    const hasPending = orders.some((o) => effectiveOrderStatus(o) === "pending");
    if (!hasPending) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [orders]);

  const download = async (uf: UnlockFile) => {
    const { data } = await supabase.storage.from("unlocks").createSignedUrl(uf.storage_path, 3600);
    if (data?.signedUrl) {
      window.location.href = data.signedUrl;
      await supabase.rpc("mark_unlock_downloaded", { p_id: uf.id });
      onChanged();
    }
  };

  return (
    <SectionCard
      icon={Receipt}
      title="Ordini e pagamenti"
      subtitle="I tuoi acquisti e lo stato dei pagamenti."
      meta={orders.length > 0 ? `${orders.length} · scorri` : undefined}
    >
      {orders.length === 0 ? (
        <p className="rounded-lg border bg-background/40 p-5 text-sm text-muted-foreground">
          Nessun ordine effettuato.
        </p>
      ) : (
        // Gli ordini possono essere molti: altezza limitata e scroll interno.
        <ul className="max-h-[24rem] space-y-2.5 overflow-y-auto pr-1">
          {orders.map((o) => {
            const uf = o.kind === "lock" ? unlocks[o.id] : undefined;
            const state = effectiveOrderStatus(o);
            const badge = ORDER_BADGE[state] ?? ORDER_BADGE.pending;
            const closed = state === "failed" || state === "canceled";
            return (
              <li
                key={o.id}
                className={`rounded-lg border bg-background/40 p-2.5 text-sm sm:p-3 ${closed ? "border-destructive/25" : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    {o.kind === "subscription" ? <Repeat className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* break-all: `PERMANENT_LOCK` è una parola sola più larga
                        della colonna a 260px. */}
                    <p className="break-all font-medium">{desc(o)}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("it-IT")} · {o.provider}
                      {state === "pending" && ` · scade alle ${new Date(o.expires_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`font-mono text-xs ${closed ? "text-muted-foreground line-through" : ""}`}>
                      {eur(o.amount_cents)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>

                {(closed || uf || (o.kind === "lock" && state === "paid")) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                    {closed && (
                      <Link
                        to={retryHref(o)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        <RotateCcw className="h-3.5 w-3.5 shrink-0" /> Riprova
                      </Link>
                    )}
                    {uf && (
                      <button
                        onClick={() => download(uf)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-2.5 py-1.5 text-xs font-medium text-white shadow-glow hover:opacity-90"
                      >
                        <Download className="h-3.5 w-3.5 shrink-0" /> Scarica sblocco
                      </button>
                    )}
                    {o.kind === "lock" && !uf && state === "paid" && (
                      <span className="text-xs text-muted-foreground">Sblocco in preparazione…</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/* ================================================================== *
 * Account e download
 * ================================================================== */

function AccountField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border bg-background/40 p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className="mt-0.5 break-all text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

/** Storico dei download: elenco scorrevole con riscarica rapida. */
function DownloadHistory({
  history, latest, onRedownload,
}: { history: DownloadRow[]; latest?: Release; onRedownload: (r: Release) => void }) {
  if (history.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-background/40 p-5 text-sm text-muted-foreground">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
          <Download className="h-4 w-4" />
        </span>
        <span className="min-w-0 break-words">Nessun download registrato.</span>
      </div>
    );
  }
  return (
    <ul className="max-h-[22rem] space-y-2.5 overflow-y-auto pr-1">
      {history.map((d) => (
        <li key={d.id} className="flex items-start gap-2.5 rounded-lg border bg-background/40 p-2.5 sm:p-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Download className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium">
              {d.version} <span className="text-muted-foreground">· SecureLocalShare.exe</span>
            </p>
            <p className="break-words text-xs text-muted-foreground">
              {new Date(d.downloaded_at).toLocaleString("it-IT")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => latest && onRedownload(latest)}
            disabled={!latest}
            aria-label="Riscarica l'ultima versione"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ReleasesSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-2">
      <div className="h-64 rounded-lg border bg-background/40" />
      <div className="h-64 rounded-lg border bg-background/30" />
    </div>
  );
}
