import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Sparkles, Clock, RefreshCw, Mail, User, MonitorDown, Trash2, Crown, ArrowUpRight, Receipt, KeyRound, Repeat } from "lucide-react";
import { supabase, RELEASES_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Navbar } from "@/components/Navbar";
import { ActivationCard } from "@/components/ActivationCard";
import { ReviewForm } from "@/components/ReviewForm";
import { Button } from "@/components/ui/button";
import { ensureActivation } from "@/lib/activations";
import type { Release, Download as DownloadRow, Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type UnlockFile = Database["public"]["Tables"]["unlock_files"]["Row"];
type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
import { getPlan, fmtEuro, type PlanCode } from "@/lib/plans";

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
      // 1. Signed URL valid 10 minutes (never a fixed public link).
      const { data, error } = await supabase.storage
        .from(RELEASES_BUCKET)
        .createSignedUrl(r.download_url, SIGNED_URL_TTL_SECONDS);
      if (error || !data) throw error ?? new Error("URL firmato non disponibile.");

      // 2. Audit the download and bump last_download_at.
      await supabase.from("downloads").insert({ email: user.email, version: r.version });
      await supabase
        .from("registrations")
        .update({ last_download_at: new Date().toISOString() })
        .eq("email", user.email);

      // 3. Ensure an activation token exists for this user (bound later by the DesktopApp).
      await ensureActivation(user.email, r.version);

      // 4. Trigger the download.
      window.location.href = data.signedUrl;
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
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          {/* ============ SX — Release ============ */}
          <div className="order-1 space-y-8 lg:order-1">
            {/* Titolo */}
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Ciao{name ? ` ${name}` : ""} <span className="align-middle">&#128075;</span>
              </h1>
              <p className="mt-1.5 text-muted-foreground">
                Ecco l'ultima versione disponibile. Riscarica quando vuoi, l'eseguibile è sempre aggiornato.
              </p>
            </div>

            {loading ? (
              <DashboardSkeleton />
            ) : !latest ? (
              <p className="rounded-xl border bg-card/60 p-8 text-center text-muted-foreground">
                Nessuna release disponibile al momento.
              </p>
            ) : (
              <>
                {/* Ultima versione */}
                <section className="border-brand-l rounded-xl rounded-l-md border bg-card/70 p-6 shadow-card sm:p-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-3 py-1 text-xs font-medium text-white">
                      <Sparkles className="h-3.5 w-3.5" /> Ultima versione
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MonitorDown className="h-3.5 w-3.5" /> Windows 10/11 - 64-bit
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline gap-3">
                    <span className="font-mono text-4xl font-bold tracking-tight">{latest.version}</span>
                    <span className="text-sm text-muted-foreground">
                      Rilasciata il{" "}
                      <span className="font-medium text-foreground">
                        {new Date(latest.release_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                    </span>
                  </div>

                  {latest.notes && (
                    <div className="mt-5 rounded-lg border border-border/60 bg-background/40 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                        Release notes
                      </p>
                      {/* Altezza fissa + scroll verticale per le note di rilascio. */}
                      <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-2 text-sm">
                        {latest.notes.split("\n").filter(Boolean).map((line, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-primary">&rsaquo;</span>
                            <span>{line.replace(/^[-*]\s*/, "")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      onClick={() => download(latest)}
                      disabled={downloadingId === latest.id}
                      className="bg-brand-gradient shadow-glow hover:opacity-90"
                    >
                      <Download className="h-5 w-5" />
                      {downloadingId === latest.id ? "Preparazione..." : "Scarica SecureLocalShare.exe"}
                    </Button>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> Link valido 10 minuti dopo il click
                    </span>
                  </div>
                </section>

                {/* Timeline versioni precedenti */}
                {previous.length > 0 && (
                  <section>
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-lg font-semibold">Versioni precedenti</h2>
                      <span className="text-xs text-muted-foreground">{previous.length} versioni · scorri</span>
                    </div>
                    {/* Altezza fissa + scroll verticale per i changelog delle versioni. */}
                    <div className="mt-4 max-h-[26rem] overflow-y-auto pr-2">
                    <ol className="relative ml-2 space-y-4 border-l border-border/60 pl-6">
                      {previous.map((r) => (
                        <li key={r.id} className="relative">
                          <span className="absolute -left-[1.94rem] top-4 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background" />
                          <div className="rounded-xl border bg-card/50 p-4 shadow-card transition-colors hover:border-primary/40">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-mono text-sm font-semibold">{r.version}</span>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(r.release_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                              </span>
                              <Button variant="outline" size="sm" onClick={() => download(r)} disabled={downloadingId === r.id} className="ml-auto">
                                <Download className="h-3.5 w-3.5" /> Scarica
                              </Button>
                            </div>
                            {r.notes && (
                              <ul className="mt-3 space-y-1 border-t border-border/40 pt-3 text-sm text-muted-foreground">
                                {r.notes.split("\n").filter(Boolean).slice(0, 3).map((line, i) => (
                                  <li key={i} className="flex gap-2">
                                    <span className="text-primary">&rsaquo;</span>
                                    <span>{line.replace(/^[-*]\s*/, "")}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          {/* ============ DX — Dati account ============ */}
          <div className="order-2 space-y-6 lg:order-2">
            {/* 0 — Piano attuale */}
            <PlanStatusCard plan={plan} sub={sub} onUpgrade={() => navigate("/pricing")}
              onRenew={() => navigate(`/checkout?plan=${plan}&cycle=${sub?.billing_cycle === "year" ? "year" : "month"}`)} />

            {/* I miei ordini e pagamenti */}
            <MyOrders orders={orders} unlocks={unlocks} onChanged={load} />

            {/* 1 — Email e nome */}
            <section>
              <h2 className="text-lg font-semibold">Dati account</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <AccountField icon={Mail} label="Email" value={user?.email ?? "-"} />
                <AccountField icon={User} label="Nome completo" value={name || "-"} />
              </div>
            </section>

            {/* 2 — Attivazione dispositivo */}
            <ActivationCard />

            {/* 3 — Versioni scaricate */}
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Versioni scaricate</h2>
                <span className="text-sm text-muted-foreground">{history.length} · ultimi 10</span>
              </div>
              {history.length === 0 ? (
                <p className="mt-3 rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">
                  Nessun download registrato. Scarica l'ultima versione per iniziare.
                </p>
              ) : (
                <ul className="mt-4 space-y-2.5">
                  {history.map((d) => (
                    <li key={d.id} className="flex items-center gap-4 rounded-lg border bg-card/50 px-4 py-3">
                      <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
                        <Download className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {d.version} <span className="text-muted-foreground">- SecureLocalShare.exe</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(d.downloaded_at).toLocaleString("it-IT")}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => latest && download(latest)} disabled={!latest}>
                        <RefreshCw className="h-3.5 w-3.5" /> Riscarica
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 4 — Recensione versione */}
            <ReviewForm versions={releases.map((r) => r.version)} defaultVersion={latest?.version} />

            {/* 5 — Elimina account */}
            <section>
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-destructive">Elimina account</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Rimuove definitivamente i tuoi dati (registrazione, download, attivazioni). Operazione irreversibile.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Eliminazione…" : "Elimina account"}
                </Button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function PlanStatusCard({ plan, sub, onUpgrade, onRenew }: { plan: PlanCode; sub: Subscription | null; onUpgrade: () => void; onRenew: () => void }) {
  const p = getPlan(plan);
  const isFree = plan === "free";
  const tone = plan === "pro" ? "#A78BFA" : plan === "essential" ? "#F59E0B" : "#8A94A6";
  return (
    <section>
      <h2 className="text-lg font-semibold">Il tuo piano</h2>
      <div className="mt-4 overflow-hidden rounded-xl border bg-card/60 p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: `${tone}1F`, color: tone }}>
              <Crown className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Piano attivo</p>
              <p className="text-lg font-bold tracking-tight" style={{ color: tone }}>{p.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm">
              {isFree ? "Gratis" : `${fmtEuro(p.priceMonth)}/mese · ${fmtEuro(p.priceYear)}/anno`}
            </p>
          </div>
        </div>

        <ul className="mt-4 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          {p.highlights.slice(0, 4).map((h) => (
            <li key={h} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{h}</span>
            </li>
          ))}
        </ul>

        {!isFree && sub?.current_period_end && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {sub.auto_renew && !sub.cancel_at_period_end
              ? <>Rinnovo automatico il <strong className="text-foreground">{new Date(sub.current_period_end).toLocaleDateString("it-IT")}</strong></>
              : <>Scade il <strong className="text-foreground">{new Date(sub.current_period_end).toLocaleDateString("it-IT")}</strong></>}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
          >
            {isFree ? <><Sparkles className="h-4 w-4" /> Fai l'upgrade</> : <><ArrowUpRight className="h-4 w-4" /> Cambia piano</>}
          </button>
          {!isFree && (
            <button onClick={onRenew} className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent">
              <Repeat className="h-4 w-4" /> Rinnova ora
            </button>
          )}
          {isFree && <span className="text-xs text-muted-foreground">Sblocca più spazio, utenti e funzionalità.</span>}
        </div>
      </div>
    </section>
  );
}

function MyOrders({ orders, unlocks, onChanged }: { orders: Order[]; unlocks: Record<string, UnlockFile>; onChanged: () => void }) {
  const eur = (c: number) => `${(c / 100).toFixed(2)}€`;
  const desc = (o: Order) =>
    o.kind === "subscription"
      ? `${o.plan_code ?? ""} · ${o.billing_cycle === "year" ? "annuale" : "mensile"}`
      : o.lock_type === "perm" ? "PERMANENT_LOCK" : "ENV_LOCK";

  const download = async (uf: UnlockFile) => {
    const { data } = await supabase.storage.from("unlocks").createSignedUrl(uf.storage_path, 3600);
    if (data?.signedUrl) {
      window.location.href = data.signedUrl;
      await supabase.rpc("mark_unlock_downloaded", { p_id: uf.id });
      onChanged();
    }
  };

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Receipt className="h-5 w-5 text-primary" /> I miei ordini e pagamenti</h2>
      {orders.length === 0 ? (
        <p className="mt-3 rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">Nessun ordine effettuato.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {orders.map((o) => {
            const uf = o.kind === "lock" ? unlocks[o.id] : undefined;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/50 px-4 py-3 text-sm">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
                  {o.kind === "subscription" ? <Repeat className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{desc(o)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("it-IT")} · {o.provider}</p>
                </div>
                <span className="ml-auto font-mono">{eur(o.amount_cents)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{o.status}</span>
                {uf && (
                  <button onClick={() => download(uf)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white shadow-glow hover:opacity-90">
                    <Download className="h-3.5 w-3.5" /> Scarica sblocco
                  </button>
                )}
                {o.kind === "lock" && !uf && o.status === "paid" && (
                  <span className="text-xs text-muted-foreground">Sblocco in preparazione…</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

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
    <div className="rounded-lg border bg-card/50 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 animate-pulse space-y-4">
      <div className="h-48 rounded-xl border bg-card/40" />
      <div className="h-14 rounded-lg border bg-card/30" />
      <div className="h-14 rounded-lg border bg-card/30" />
    </div>
  );
}
