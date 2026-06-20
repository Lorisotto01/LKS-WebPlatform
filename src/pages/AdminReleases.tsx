import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  UploadCloud, Trash2, CheckCircle2, CircleSlash, FileUp, ShieldCheck, ShieldAlert,
  FileSignature, Download, Clock, Inbox, Bug, Lightbulb, MessageSquare,
} from "lucide-react";
import { supabase, RELEASES_BUCKET } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Release, Report } from "@/types/database.types";

// SHA-256 del file calcolato nel browser (Web Crypto), hex lowercase a 64 char.
async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ReportStatus = "aperta" | "in_lavorazione" | "chiusa";
const STATUS_FLOW: ReportStatus[] = ["aperta", "in_lavorazione", "chiusa"];
const STATUS_META: Record<ReportStatus, { label: string; cls: string }> = {
  aperta: { label: "Aperta", cls: "bg-warning/15 text-warning" },
  in_lavorazione: { label: "In lavorazione", cls: "bg-primary/15 text-primary" },
  chiusa: { label: "Chiusa", cls: "bg-success/15 text-success" },
};
const TIPO_META: Record<string, { label: string; icon: typeof Bug; cls: string }> = {
  bug: { label: "Bug", icon: Bug, cls: "bg-rose-500/15 text-rose-300" },
  idea: { label: "Idea", icon: Lightbulb, cls: "bg-violet-500/15 text-violet-300" },
  altro: { label: "Altro", icon: MessageSquare, cls: "bg-secondary text-muted-foreground" },
};

export function AdminReleases() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const sigFileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sha256, setSha256] = useState("");
  const [hashing, setHashing] = useState(false);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [minVersion, setMinVersion] = useState("");
  const [signature, setSignature] = useState("");
  const [signKeyId, setSignKeyId] = useState("");
  const [setAsLatest, setSetAsLatest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [reports, setReports] = useState<Report[]>([]);
  const [reportFilter, setReportFilter] = useState<"tutte" | ReportStatus>("tutte");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("releases").select("*").order("release_date", { ascending: false });
    if (error) toast.error("Caricamento release non riuscito.");
    setReleases(data ?? []);
    const dc = await supabase.rpc("release_download_counts");
    if (!dc.error && dc.data) {
      const map: Record<string, number> = {};
      for (const row of dc.data as { version: string; total: number }[]) map[row.version] = Number(row.total);
      setCounts(map);
    }
  };

  const loadReports = async () => {
    const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (error) { setReports([]); return; }
    setReports(data ?? []);
  };

  useEffect(() => { load(); loadReports(); /* eslint-disable-next-line */ }, []);

  const reset = () => {
    setFile(null); setSha256(""); setVersion(""); setNotes(""); setMinVersion("");
    setSignature(""); setSignKeyId(""); setSetAsLatest(true);
    if (fileRef.current) fileRef.current.value = "";
    if (sigFileRef.current) sigFileRef.current.value = "";
  };

  const onPickFile = async (f: File | null) => {
    setFile(f); setSha256("");
    if (!f) return;
    setHashing(true);
    try { setSha256(await sha256Hex(f)); } catch { toast.error("Calcolo SHA-256 non riuscito."); }
    finally { setHashing(false); }
  };

  const onPickSig = async (f: File | null) => {
    if (!f) return;
    try { setSignature((await f.text()).trim()); } catch { toast.error("Lettura del file .sig non riuscita."); }
  };

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Seleziona l'eseguibile .exe da caricare.");
    if (!version.trim()) return toast.error("Indica la versione (es. v1.2.0).");
    if (hashing || !sha256) return toast.error("Attendi il calcolo dello SHA-256 del file.");
    if (setAsLatest && (!sha256 || !signature.trim()))
      return toast.error("Per attivare la release servono SHA-256 (auto) e firma Ed25519.");
    setBusy(true);
    try {
      const objectPath = file.name;
      const up = await supabase.storage.from(RELEASES_BUCKET)
        .upload(objectPath, file, { upsert: true, contentType: "application/octet-stream" });
      if (up.error) throw up.error;
      if (setAsLatest) await supabase.from("releases").update({ is_active: false }).neq("version", version.trim());
      const ins = await supabase.from("releases").upsert({
        version: version.trim(),
        notes: notes.trim() || null,
        download_url: objectPath,
        is_active: setAsLatest,
        min_version: minVersion.trim() || version.trim(),
        release_date: new Date().toISOString(),
        sha256,
        signature: signature.trim() || null,
        sign_key_id: signKeyId.trim() || null,
      }, { onConflict: "version" });
      if (ins.error) throw ins.error;
      toast.success(`Release ${version.trim()} pubblicata.`);
      reset(); load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pubblicazione non riuscita.");
    } finally { setBusy(false); }
  };

  const toggleActive = async (r: Release) => {
    if (!r.is_active && (!r.sha256 || !r.signature))
      return toast.error("Release non firmata: aggiungi SHA-256 e firma prima di attivarla.");
    const { error } = await supabase.from("releases").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (r: Release) => {
    if (!confirm(`Eliminare la release ${r.version} e il relativo file?`)) return;
    await supabase.storage.from(RELEASES_BUCKET).remove([r.download_url]);
    const { error } = await supabase.from("releases").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(`Release ${r.version} eliminata.`);
    load();
  };

  const setReportStatus = async (rep: Report, status: ReportStatus) => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", rep.id);
    if (error) return toast.error(error.message);
    loadReports();
  };

  const saveNote = async (rep: Report) => {
    const note = noteDrafts[rep.id] ?? rep.admin_note ?? "";
    const { error } = await supabase.from("reports").update({ admin_note: note || null }).eq("id", rep.id);
    if (error) return toast.error(error.message);
    toast.success("Nota salvata.");
    loadReports();
  };

  const visibleReports = reportFilter === "tutte" ? reports : reports.filter((r) => r.status === reportFilter);
  const openCount = reports.filter((r) => r.status !== "chiusa").length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight">Pannello admin</h1>
        <p className="mt-1.5 text-muted-foreground">
          Pubblica le release, gestisci l'albero delle versioni e le segnalazioni. I permessi sono concessi solo al tuo
          account admin.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {/* SX — Pubblicazione */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Pubblica una release</h2>
            <form onSubmit={publish} className="rounded-xl border bg-card/60 p-6 shadow-card">
              <Label>Eseguibile (.exe)</Label>
              <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-background/40 px-4 py-4 transition-colors hover:border-primary/50">
                <FileUp className="h-5 w-5 text-primary" />
                <span className="min-w-0 flex-1 text-sm">
                  {file ? (
                    <span className="font-medium">
                      {file.name} <span className="text-muted-foreground">({(file.size / 1e6).toFixed(1)} MB)</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Clicca per selezionare il file .exe…</span>
                  )}
                </span>
                <input ref={fileRef} type="file" accept=".exe,application/octet-stream" className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
              </label>

              {file && (
                <div className="mt-2 flex items-start gap-2 text-xs">
                  {hashing ? (
                    <span className="text-muted-foreground">Calcolo SHA-256 in corso…</span>
                  ) : sha256 ? (
                    <>
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span className="min-w-0">
                        <span className="font-semibold text-success">SHA-256</span>{" "}
                        <span className="break-all font-mono text-muted-foreground">{sha256}</span>
                      </span>
                    </>
                  ) : null}
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Versione</Label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.2.0" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Versione minima (auto-update)</Label>
                  <Input value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="default = versione" />
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <FileSignature className="h-4 w-4 text-primary" /> Firma Ed25519 (detached)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Genera la firma offline col Tool-CLI (<code>sign-release</code>) e incolla qui la firma base64, oppure
                  carica il file <code>.sig</code>. La chiave privata non transita mai dal browser.
                </p>
                <div className="mt-3 flex flex-col gap-1.5">
                  <Label>Firma (base64)</Label>
                  <textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={3}
                    placeholder="MEUCIQ… (firma Ed25519 detached, base64)"
                    className="flex w-full break-all rounded-md border border-input bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <label className="mt-1 inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs text-primary hover:underline">
                    <FileUp className="h-3.5 w-3.5" /> Carica file .sig
                    <input ref={sigFileRef} type="file" accept=".sig,.txt,text/plain" className="hidden"
                      onChange={(e) => onPickSig(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <Label>ID chiave di firma (sign_key_id)</Label>
                  <Input value={signKeyId} onChange={(e) => setSignKeyId(e.target.value)} placeholder="es. lks-ed25519-2026-01" />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-1.5">
                <Label>Release notes (una per riga)</Label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
                  placeholder={"Prima release pubblica\nSistema di crittografia AES-256-GCM\nWeb App multi-utente"}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={setAsLatest} onChange={(e) => setSetAsLatest(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary" />
                Imposta come ultima versione (disattiva le precedenti)
              </label>
              {setAsLatest && (!sha256 || !signature.trim()) && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
                  <ShieldAlert className="h-3.5 w-3.5" /> Per attivare la release servono SHA-256 e firma Ed25519.
                </p>
              )}

              <div className="mt-5 flex items-center gap-3">
                <Button type="submit" disabled={busy} className="bg-brand-gradient shadow-glow hover:opacity-90">
                  <UploadCloud className="h-5 w-5" />
                  {busy ? "Pubblicazione…" : "Carica e pubblica"}
                </Button>
                {busy && <span className="text-xs text-muted-foreground">Upload in corso, non chiudere la pagina…</span>}
              </div>
            </form>
          </section>

          {/* DX — Version tree */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Version tree</h2>
            {releases.length === 0 ? (
              <p className="rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">
                Nessuna release ancora pubblicata.
              </p>
            ) : (
              <ol className="relative ml-2 space-y-4 border-l border-border/60 pl-6">
                {releases.map((r) => {
                  const signed = Boolean(r.sha256 && r.signature);
                  const dls = counts[r.version] ?? 0;
                  return (
                    <li key={r.id} className="relative">
                      <span className={`absolute -left-[1.94rem] top-4 h-3.5 w-3.5 rounded-full border-2 bg-background ${r.is_active ? "border-success" : "border-border"}`} />
                      <div className="rounded-xl border bg-card/50 p-4 shadow-card transition-colors hover:border-primary/40">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{r.version}</span>
                          {r.is_active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                              <CheckCircle2 className="h-3 w-3" /> attiva
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <CircleSlash className="h-3 w-3" /> nascosta
                            </span>
                          )}
                          {signed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success" title={`SHA-256: ${r.sha256}`}>
                              <ShieldCheck className="h-3 w-3" /> firmata
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                              <ShieldAlert className="h-3 w-3" /> non firmata
                            </span>
                          )}
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary" title="Download totali di questa versione">
                            <Download className="h-3 w-3" /> {dls}
                          </span>
                        </div>
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(r.release_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                          <span className="mx-1">·</span>
                          <span className="truncate">{r.download_url}</span>
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => toggleActive(r)} disabled={!r.is_active && !signed}>
                            {r.is_active ? "Nascondi" : "Attiva"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => remove(r)} className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5" /> Elimina
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Segnalazioni */}
        <section className="mt-12">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Inbox className="h-5 w-5 text-primary" /> Segnalazioni
              {openCount > 0 && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">{openCount} aperte</span>
              )}
            </h2>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {(["tutte", "aperta", "in_lavorazione", "chiusa"] as const).map((f) => (
                <button key={f} onClick={() => setReportFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${reportFilter === f ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  {f === "tutte" ? "Tutte" : STATUS_META[f].label}
                </button>
              ))}
            </div>
          </div>

          {visibleReports.length === 0 ? (
            <p className="rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">
              Nessuna segnalazione {reportFilter === "tutte" ? "presente" : "in questo stato"}.
            </p>
          ) : (
            <ul className="space-y-3">
              {visibleReports.map((rep) => {
                const tipo = TIPO_META[rep.tipo] ?? TIPO_META.altro;
                const TipoIcon = tipo.icon;
                return (
                  <li key={rep.id} className="rounded-xl border bg-card/50 p-4 shadow-card">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tipo.cls}`}>
                        <TipoIcon className="h-3 w-3" /> {tipo.label}
                      </span>
                      <span className="font-semibold">{rep.titolo}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_META[rep.status].cls}`}>
                        {STATUS_META[rep.status].label}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(rep.created_at).toLocaleString("it-IT")}</span>
                    </div>

                    {rep.descrizione && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{rep.descrizione}</p>}

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {rep.email && <span>✉ {rep.email}</span>}
                      {rep.app_version && <span>versione app: {rep.app_version}</span>}
                      {rep.hwid && <span className="truncate">hwid: <span className="font-mono">{rep.hwid}</span></span>}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Stato:</span>
                      {STATUS_FLOW.map((st) => (
                        <button key={st} onClick={() => setReportStatus(rep, st)} disabled={rep.status === st}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${rep.status === st ? `${STATUS_META[st].cls} cursor-default` : "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                          {STATUS_META[st].label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-col gap-1.5">
                      <Label className="text-xs">Nota interna</Label>
                      <textarea value={noteDrafts[rep.id] ?? rep.admin_note ?? ""}
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [rep.id]: e.target.value }))}
                        rows={2} placeholder="Annotazioni interne (visibili solo a te)…"
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                      <Button variant="outline" size="sm" className="w-fit" onClick={() => saveNote(rep)}>Salva nota</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
