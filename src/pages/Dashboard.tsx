import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Sparkles, Clock, RefreshCw, Mail, User, MonitorDown, Trash2 } from "lucide-react";
import { supabase, RELEASES_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Navbar } from "@/components/Navbar";
import { ActivationCard } from "@/components/ActivationCard";
import { Button } from "@/components/ui/button";
import { ensureActivation } from "@/lib/activations";
import type { Release, Download as DownloadRow } from "@/types/database.types";

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

  const load = async () => {
    setLoading(true);
    const [rel, dl] = await Promise.all([
      supabase.from("releases").select("*").order("release_date", { ascending: false }),
      supabase.from("downloads").select("*").order("downloaded_at", { ascending: false }).limit(10),
    ]);
    if (rel.error) toast.error("Caricamento release non riuscito.");
    setReleases(rel.data ?? []);
    setHistory(dl.data ?? []);
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
      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Greeting */}
        <h1 className="text-3xl font-extrabold tracking-tight">
          Ciao{name ? ` ${name}` : ""} <span className="align-middle">&#128075;</span>
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Ecco l'ultima versione disponibile. Riscarica quando vuoi, l'eseguibile è sempre aggiornato.
        </p>

        {loading ? (
          <DashboardSkeleton />
        ) : !latest ? (
          <p className="mt-10 rounded-xl border bg-card/60 p-8 text-center text-muted-foreground">
            Nessuna release disponibile al momento.
          </p>
        ) : (
          <>
            {/* ---- Latest release hero ---- */}
            <section className="border-brand-l mt-8 rounded-xl rounded-l-md border bg-card/70 p-6 shadow-card sm:p-7">
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
                  <ul className="space-y-1.5 text-sm">
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

            {/* ---- Download history ---- */}
            <section className="mt-10">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">I tuoi download</h2>
                <span className="text-sm text-muted-foreground">{history.length} download - ultimi 10</span>
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
                      <Button variant="outline" size="sm" onClick={() => latest && download(latest)}>
                        <RefreshCw className="h-3.5 w-3.5" /> Riscarica
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ---- Previous versions ---- */}
            {previous.length > 0 && (
              <section className="mt-10">
                <h2 className="text-lg font-semibold">Versioni precedenti</h2>
                <ul className="mt-4 divide-y rounded-lg border bg-card/40">
                  {previous.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-muted-foreground">{r.version}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.release_date).toLocaleDateString("it-IT")}
                      </span>
                      {r.notes && (
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                          {r.notes.split("\n")[0]}
                        </span>
                      )}
                      <Button variant="outline" size="sm" onClick={() => download(r)} disabled={downloadingId === r.id} className="ml-auto">
                        <Download className="h-3.5 w-3.5" /> Scarica
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ---- Account ---- */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Dati account</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <AccountField icon={Mail} label="Email" value={user?.email ?? "-"} />
                <AccountField icon={User} label="Nome completo" value={name || "-"} />
              </div>

              {/* GDPR — diritto all'oblio */}
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
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
          </>
        )}

        <ActivationCard />
      </main>
    </div>
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
