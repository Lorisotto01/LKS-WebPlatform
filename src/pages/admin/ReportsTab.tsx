import { useEffect, useState } from "react";
import {
  Inbox, Bug, Wrench, MessageSquare, RefreshCw, Paperclip, X, Download, Eye,
  Mail, Tag, Cpu, Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Report, ReportAttachment } from "@/types/database.types";

const ATTACHMENTS_BUCKET = "report-attachments";

type ReportStatus = "aperta" | "in_lavorazione" | "chiusa";
const STATUS_FLOW: ReportStatus[] = ["aperta", "in_lavorazione", "chiusa"];
const STATUS_META: Record<ReportStatus, { label: string; cls: string }> = {
  aperta: { label: "Aperta", cls: "bg-warning/15 text-warning" },
  in_lavorazione: { label: "In lavorazione", cls: "bg-primary/15 text-primary" },
  chiusa: { label: "Chiusa", cls: "bg-success/15 text-success" },
};
const TIPO_META: Record<string, { label: string; icon: typeof Bug; cls: string }> = {
  bug: { label: "Bug", icon: Bug, cls: "bg-rose-500/15 text-rose-300" },
  implementazione: { label: "Implementazione", icon: Wrench, cls: "bg-violet-500/15 text-violet-300" },
  altro: { label: "Altro", icon: MessageSquare, cls: "bg-secondary text-muted-foreground" },
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Tab Segnalazioni: righe compatte + modale di dettaglio (con allegati). */
export function ReportsTab() {
  const toast = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [attachments, setAttachments] = useState<Record<string, ReportAttachment[]>>({});
  const [reportFilter, setReportFilter] = useState<"tutte" | ReportStatus>("tutte");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (error) { setReports([]); toast.error("Caricamento segnalazioni non riuscito."); }
    else setReports(data ?? []);

    const { data: att } = await supabase
      .from("report_attachments").select("*").order("created_at", { ascending: true });
    const grouped: Record<string, ReportAttachment[]> = {};
    for (const a of att ?? []) (grouped[a.report_id] ??= []).push(a);
    setAttachments(grouped);

    setLoading(false);
  };

  useEffect(() => { loadReports(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const viewAttachment = async (a: ReportAttachment) => {
    const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(a.path, 3600);
    if (error || !data?.signedUrl) return toast.error("Impossibile aprire l'allegato.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const downloadAttachment = async (a: ReportAttachment) => {
    const { data, error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET).createSignedUrl(a.path, 3600, { download: a.filename ?? true });
    if (error || !data?.signedUrl) return toast.error("Download dell'allegato non riuscito.");
    const link = document.createElement("a");
    link.href = data.signedUrl; link.download = a.filename ?? "allegato";
    document.body.appendChild(link); link.click(); link.remove();
  };

  const reload = async () => { await loadReports(); toast.success("Tabella aggiornata."); };

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
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Inbox className="h-5 w-5 text-primary" /> Segnalazioni
          {openCount > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">{openCount} aperte</span>
          )}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {(["tutte", "aperta", "in_lavorazione", "chiusa"] as const).map((f) => (
            <button key={f} onClick={() => setReportFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${reportFilter === f ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {f === "tutte" ? "Tutte" : STATUS_META[f].label}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="ml-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Ricarica
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg border bg-card/40" />)}</div>
      ) : visibleReports.length === 0 ? (
        <p className="rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">
          Nessuna segnalazione {reportFilter === "tutte" ? "presente" : "in questo stato"}.
        </p>
      ) : (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border bg-card/50">
          {visibleReports.map((rep) => {
            const tipo = TIPO_META[rep.tipo] ?? TIPO_META.altro;
            const TipoIcon = tipo.icon;
            const attCount = attachments[rep.id]?.length ?? 0;
            return (
              <li key={rep.id}>
                <button onClick={() => setSelectedId(rep.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40">
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${tipo.cls}`}>
                    <TipoIcon className="h-3 w-3" /> {tipo.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{rep.titolo}</span>
                  {attCount > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title={`${attCount} allegati`}>
                      <Paperclip className="h-3.5 w-3.5" /> {attCount}
                    </span>
                  )}
                  <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] sm:inline-flex ${STATUS_META[rep.status].cls}`}>
                    {STATUS_META[rep.status].label}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                    {new Date(rep.created_at).toLocaleDateString("it-IT")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <ReportModal
          report={selected}
          attachments={attachments[selected.id] ?? []}
          noteDraft={noteDrafts[selected.id] ?? selected.admin_note ?? ""}
          onNoteChange={(v) => setNoteDrafts((d) => ({ ...d, [selected.id]: v }))}
          onSaveNote={() => saveNote(selected)}
          onSetStatus={(st) => setReportStatus(selected, st)}
          onView={viewAttachment}
          onDownload={downloadAttachment}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}

function ReportModal({
  report, attachments, noteDraft, onNoteChange, onSaveNote, onSetStatus, onView, onDownload, onClose,
}: {
  report: Report;
  attachments: ReportAttachment[];
  noteDraft: string;
  onNoteChange: (v: string) => void;
  onSaveNote: () => void;
  onSetStatus: (st: ReportStatus) => void;
  onView: (a: ReportAttachment) => void;
  onDownload: (a: ReportAttachment) => void;
  onClose: () => void;
}) {
  const tipo = TIPO_META[report.tipo] ?? TIPO_META.altro;
  const TipoIcon = tipo.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border/70 bg-card p-6 shadow-glow">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tipo.cls}`}>
                <TipoIcon className="h-3 w-3" /> {tipo.label}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_META[report.status].cls}`}>
                {STATUS_META[report.status].label}
              </span>
            </div>
            <h3 className="mt-2 break-words text-lg font-semibold">{report.titolo}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Meta icon={Clock} label="Data" value={new Date(report.created_at).toLocaleString("it-IT")} />
          {report.email && <Meta icon={Mail} label="Email" value={report.email} />}
          {report.app_version && <Meta icon={Tag} label="Versione app" value={report.app_version} />}
          {report.hwid && <Meta icon={Cpu} label="HWID" value={report.hwid} mono />}
        </div>

        {report.descrizione && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Descrizione</p>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{report.descrizione}</p>
          </div>
        )}

        <div className="mt-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Paperclip className="h-3.5 w-3.5" /> Allegati {attachments.length > 0 && `(${attachments.length})`}
          </p>
          {attachments.length === 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">Nessun allegato.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {attachments.map((a) => {
                const isImage = (a.content_type ?? "").startsWith("image/");
                return (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      <Paperclip className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.filename ?? "allegato"}</p>
                      <p className="text-xs text-muted-foreground">
                        {isImage ? "Immagine" : a.content_type ?? "file"}{a.size_bytes ? ` · ${formatSize(a.size_bytes)}` : ""}
                      </p>
                    </div>
                    <button onClick={() => onView(a)} title="Visualizza"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                      <Eye className="h-3.5 w-3.5" /> Apri
                    </button>
                    <button onClick={() => onDownload(a)} title="Scarica"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                      <Download className="h-3.5 w-3.5" /> Scarica
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Stato:</span>
          {STATUS_FLOW.map((st) => (
            <button key={st} onClick={() => onSetStatus(st)} disabled={report.status === st}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${report.status === st ? `${STATUS_META[st].cls} cursor-default` : "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
              {STATUS_META[st].label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <Label className="text-xs">Nota dello sviluppatore</Label>
          <textarea value={noteDraft} onChange={(e) => onNoteChange(e.target.value)} rows={3}
            placeholder="Annotazioni interne (visibili solo a te)…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button variant="outline" size="sm" className="w-fit" onClick={onSaveNote}>Salva nota</Button>
        </div>
      </div>
    </div>
  );
}

function Meta({
  icon: Icon, label, value, mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className={`truncate text-sm ${mono ? "font-mono text-xs" : ""}`} title={value}>{value}</p>
      </div>
    </div>
  );
}
