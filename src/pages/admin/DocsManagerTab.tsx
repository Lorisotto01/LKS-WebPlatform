import { useEffect, useRef, useState } from "react";
import {
  FileText, Eye, EyeOff, User, Plus, Trash2, Save, GripVertical, Image as ImageIcon,
  Settings2, ListChecks, Layers, Type, AlignLeft, StickyNote, AlertTriangle, Table as TableIcon,
  Code2, Minus, Copy, Check, UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAllDocBlocks, createDocBlock, updateDocBlock, deleteDocBlock, persistOrder,
  getDocSettings, updateDocSettings, listDocsMedia, uploadDocsMedia, deleteDocsMedia,
  defaultContent, BLOCK_LABELS, type DocBlock, type DocBlockType, type MediaItem,
} from "@/lib/docs";
import { getAuthorProfile, updateAuthorProfile, uploadProfilePhoto } from "@/lib/profile";
import type { AuthorProfile, AuthorContact, DocSettings } from "@/types/database.types";

const PALETTE: { type: DocBlockType; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "title", icon: Type },
  { type: "paragraph", icon: AlignLeft },
  { type: "image", icon: ImageIcon },
  { type: "note", icon: StickyNote },
  { type: "warning", icon: AlertTriangle },
  { type: "list", icon: ListChecks },
  { type: "table", icon: TableIcon },
  { type: "code", icon: Code2 },
  { type: "divider", icon: Minus },
];

function typeIcon(type: DocBlockType): React.ComponentType<{ className?: string }> {
  return PALETTE.find((p) => p.type === type)?.icon ?? AlignLeft;
}

export function DocsManagerTab() {
  const [view, setView] = useState<"docs" | "profilo">("docs");
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-4 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold">Docs Manager</h2>
            <p className="text-xs text-muted-foreground">Gestisci, organizza e pubblica la documentazione e il profilo pubblico.</p>
          </div>
        </div>
        <Link to="/docs" target="_blank"><Button variant="outline" size="sm"><Eye className="h-4 w-4" /> Anteprima</Button></Link>
      </div>

      <div className="mt-4 inline-flex rounded-lg border border-border/60 bg-card/40 p-1 text-sm">
        <button onClick={() => setView("docs")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${view === "docs" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          <FileText className="h-4 w-4" /> Documentazione
        </button>
        <button onClick={() => setView("profilo")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${view === "profilo" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          <User className="h-4 w-4" /> Profilo Chi sono
        </button>
      </div>

      <div className="mt-4">{view === "docs" ? <DocsAdmin /> : <ProfileEditor />}</div>
    </div>
  );
}

/* ============================================================ Documentazione */

function DocsAdmin() {
  const [pane, setPane] = useState<"struttura" | "media" | "impostazioni">("struttura");
  const NAV = [
    { key: "struttura" as const, icon: ListChecks, label: "Struttura" },
    { key: "media" as const, icon: Layers, label: "Media" },
    { key: "impostazioni" as const, icon: Settings2, label: "Impostazioni" },
  ];
  return (
    <div>
      {/* Tab Struttura / Media / Impostazioni */}
      <nav className="flex flex-wrap gap-1.5 border-b border-border/60 pb-px">
        {NAV.map((n) => (
          <button key={n.key} onClick={() => setPane(n.key)}
            className={`inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${pane === n.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <n.icon className="h-4 w-4" /> {n.label}
          </button>
        ))}
      </nav>
      <div className="mt-5">
        {pane === "struttura" && <StructurePane />}
        {pane === "media" && <MediaPane />}
        {pane === "impostazioni" && <SettingsPane />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Struttura */

function StructurePane() {
  const toast = useToast();
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const b = await getAllDocBlocks();
    setBlocks(b);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const add = async (type: DocBlockType) => {
    const position = (blocks.length + 1) * 10;
    const { block, error } = await createDocBlock(type, position);
    if (error || !block) return toast.error(error ?? "Creazione blocco non riuscita.");
    setBlocks((prev) => [...prev, block]);
    setSelectedId(block.id);
  };

  const onDrop = async (toIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === toIndex) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    setBlocks(next);
    const { error } = await persistOrder(next);
    if (error) toast.error(error); else load();
  };

  const patchSelected = (content: Record<string, unknown>) =>
    setBlocks((prev) => prev.map((b) => (b.id === selectedId ? { ...b, content } : b)));

  const saveSelected = async () => {
    if (!selected) return;
    const { error } = await updateDocBlock(selected.id, { content: selected.content });
    if (error) return toast.error(error);
    toast.success("Blocco salvato.");
  };

  const changeType = async (type: DocBlockType) => {
    if (!selected) return;
    const content = defaultContent(type);
    const { error } = await updateDocBlock(selected.id, { type, content });
    if (error) return toast.error(error);
    setBlocks((prev) => prev.map((b) => (b.id === selected.id ? { ...b, type, content } : b)));
  };

  const toggleVisible = async (b: DocBlock) => {
    const { error } = await updateDocBlock(b.id, { visible: !b.visible });
    if (error) return toast.error(error);
    setBlocks((prev) => prev.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)));
  };

  const remove = async (b: DocBlock) => {
    if (!confirm("Eliminare questo blocco?")) return;
    const { error } = await deleteDocBlock(b.id);
    if (error) return toast.error(error);
    setBlocks((prev) => prev.filter((x) => x.id !== b.id));
    if (selectedId === b.id) setSelectedId(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)_300px]">
      {/* Palette */}
      <div className="h-fit rounded-xl border bg-card/50 p-3">
        <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Aggiungi blocco</p>
        <div className="space-y-1">
          {PALETTE.map((p) => (
            <button key={p.type} onClick={() => add(p.type)}
              className="flex w-full items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><p.icon className="h-3.5 w-3.5" /></span>
              <span className="flex-1">{BLOCK_LABELS[p.type]}</span>
              <Plus className="h-3 w-3 text-muted-foreground/60" />
            </button>
          ))}
        </div>
      </div>

      {/* Struttura documento (drag&drop) */}
      <div className="min-w-0 rounded-xl border bg-card/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Struttura del documento</h3>
            <p className="text-xs text-muted-foreground">Trascina i blocchi per riordinarli.</p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">{blocks.length} blocchi</span>
        </div>
        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-card/40" />)}</div>
        ) : blocks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-background/40 p-8 text-center text-sm text-muted-foreground">
            Nessun blocco. Aggiungine uno dalla palette a sinistra.
          </div>
        ) : (
          <ol className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {blocks.map((b, i) => {
              const TypeIcon = typeIcon(b.type);
              return (
                <li key={b.id} draggable
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
                  onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
                  onDrop={() => { onDrop(i); setDragOver(null); }}
                  onDragEnd={() => setDragOver(null)}
                  className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-all ${
                    dragOver === i ? "border-primary ring-2 ring-primary/30" :
                    selectedId === b.id ? "border-primary/60 bg-primary/5 shadow-card" : "border-border/50 bg-background/40 hover:border-primary/30"
                  } ${!b.visible ? "opacity-55" : ""}`}>
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground" />
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><TypeIcon className="h-4 w-4" /></span>
                  <button onClick={() => setSelectedId(b.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{BLOCK_LABELS[b.type]}</span>
                      {!b.visible && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">nascosto</span>}
                    </span>
                    <span className="mt-0.5 block whitespace-pre-line break-words text-xs text-muted-foreground line-clamp-2">{blockSnippet(b) || "—"}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <button onClick={() => toggleVisible(b)} title={b.visible ? "Nascondi" : "Mostra"} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                      {b.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => remove(b)} title="Elimina" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Editor blocco selezionato */}
      <aside className="h-fit rounded-xl border bg-card/50 p-4">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Seleziona un blocco per modificarlo.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Blocco selezionato</p>
              <button onClick={() => toggleVisible(selected)} className="text-xs text-muted-foreground hover:text-foreground">
                {selected.visible ? "Visibile" : "Nascosto"}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <Label className="text-xs">Tipo di blocco</Label>
              <select value={selected.type} onChange={(e) => changeType(e.target.value as DocBlockType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {PALETTE.map((p) => <option key={p.type} value={p.type}>{BLOCK_LABELS[p.type]}</option>)}
              </select>
            </div>

            <div className="mt-3"><BlockEditor block={selected} onChange={patchSelected} /></div>

            <Button onClick={saveSelected} size="sm" className="mt-4 w-full bg-brand-gradient shadow-glow hover:opacity-90">
              <Save className="h-3.5 w-3.5" /> Salva blocco
            </Button>
          </>
        )}
      </aside>
    </div>
  );
}

function blockSnippet(b: DocBlock): string {
  const c = b.content as Record<string, unknown>;
  if (typeof c.text === "string") return c.text;
  if (Array.isArray(c.items)) return (c.items as unknown[]).map(String).join(", ");
  if (typeof c.code === "string") return c.code || "codice";
  if (typeof c.url === "string") return c.url || "immagine";
  if (b.type === "divider") return "— divisore —";
  if (b.type === "table") return "tabella";
  return BLOCK_LABELS[b.type];
}

const sstr = (v: unknown, fb = ""): string => (typeof v === "string" ? v : fb);

function BlockEditor({ block, onChange }: { block: DocBlock; onChange: (content: Record<string, unknown>) => void }) {
  const c = block.content;
  const set = (patch: Record<string, unknown>) => onChange({ ...c, ...patch });
  const ta = "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  switch (block.type) {
    case "title":
      return (
        <div className="space-y-2">
          <Label className="text-xs">Testo</Label>
          <Input value={sstr(c.text)} onChange={(e) => set({ text: e.target.value })} />
          <Label className="text-xs">Icona (nome lucide)</Label>
          <Input value={sstr(c.icon, "BookOpen")} onChange={(e) => set({ icon: e.target.value })} placeholder="es. ShieldCheck" />
        </div>
      );
    case "paragraph":
    case "note":
    case "warning":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Testo (Markdown: **grassetto**, `codice`, [link](url))</Label>
          <textarea value={sstr(c.text)} onChange={(e) => set({ text: e.target.value })} rows={6} className={ta} />
        </div>
      );
    case "image":
      return <ImageBlockEditor c={c} set={set} />;
    case "list": {
      const items = Array.isArray(c.items) ? (c.items as unknown[]).map(String) : [];
      return (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={Boolean(c.ordered)} onChange={(e) => set({ ordered: e.target.checked })} className="h-4 w-4 rounded border-input accent-primary" />
            Lista numerata
          </label>
          <Label className="text-xs">Elementi (uno per riga)</Label>
          <textarea value={items.join("\n")} onChange={(e) => set({ items: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} rows={6} className={ta} />
        </div>
      );
    }
    case "table": {
      const rows = Array.isArray(c.rows) ? (c.rows as unknown[]).map((r) => (Array.isArray(r) ? (r as unknown[]).map(String) : [])) : [];
      const text = rows.map((r) => r.join(" | ")).join("\n");
      return (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={Boolean(c.header)} onChange={(e) => set({ header: e.target.checked })} className="h-4 w-4 rounded border-input accent-primary" />
            Prima riga = intestazione
          </label>
          <Label className="text-xs">Righe (celle separate da “ | ”)</Label>
          <textarea value={text} onChange={(e) => set({ rows: e.target.value.split("\n").map((line) => line.split("|").map((s) => s.trim())) })} rows={6} className={`${ta} font-mono text-xs`} />
        </div>
      );
    }
    case "code":
      return (
        <div className="space-y-2">
          <Label className="text-xs">Linguaggio</Label>
          <Input value={sstr(c.lang, "text")} onChange={(e) => set({ lang: e.target.value })} />
          <Label className="text-xs">Codice</Label>
          <textarea value={sstr(c.code)} onChange={(e) => set({ code: e.target.value })} rows={6} className={`${ta} font-mono text-xs`} />
        </div>
      );
    case "divider":
      return <p className="text-xs text-muted-foreground">Il divisore non ha contenuto.</p>;
    default:
      return null;
  }
}

/** Editor del blocco immagine: selezione tramite dropdown dalle immagini caricate in Media. */
function ImageBlockEditor({ c, set }: { c: Record<string, unknown>; set: (patch: Record<string, unknown>) => void }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { listDocsMedia().then((m) => { setMedia(m); setLoading(false); }); }, []);

  const current = sstr(c.url);
  const known = media.some((m) => m.url === current);
  const selectCls = "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-2">
      <Label className="text-xs">Immagine (dalla sezione Media)</Label>
      <select value={current} onChange={(e) => set({ url: e.target.value })} className={selectCls} disabled={loading && media.length === 0}>
        <option value="">{loading ? "Caricamento…" : "— Seleziona un'immagine —"}</option>
        {!known && current && <option value={current}>(URL corrente)</option>}
        {media.map((m) => <option key={m.name} value={m.url}>{m.name}</option>)}
      </select>
      {!loading && media.length === 0 && (
        <p className="text-xs text-muted-foreground">Nessuna immagine disponibile. Caricane una dalla tab <span className="font-medium text-foreground">Media</span>.</p>
      )}
      {current && (
        <img src={current} alt="anteprima" className="mt-1 max-h-28 w-full rounded-md border border-border/60 object-contain" />
      )}
      <Label className="text-xs">Testo alternativo</Label>
      <Input value={sstr(c.alt)} onChange={(e) => set({ alt: e.target.value })} />
      <Label className="text-xs">Didascalia</Label>
      <Input value={sstr(c.caption)} onChange={(e) => set({ caption: e.target.value })} />
    </div>
  );
}

/* -------------------------------------------------------------------- Media */

function MediaPane() {
  const toast = useToast();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => { setLoading(true); setItems(await listDocsMedia()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    const { error } = await uploadDocsMedia(file);
    setUploading(false);
    if (error) return toast.error(error);
    toast.success("Immagine caricata.");
    load();
  };

  const remove = async (name: string) => {
    if (!confirm("Eliminare questa immagine?")) return;
    const { error } = await deleteDocsMedia(name);
    if (error) return toast.error(error);
    load();
  };

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-xl border bg-card/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Media</h3>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-brand-gradient px-3 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90">
          <UploadCloud className="h-4 w-4" /> {uploading ? "Caricamento…" : "Carica immagine"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Carica le immagini usate nei blocchi “Immagine”. Copia l'URL e incollalo nel blocco.</p>

      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-card/40" />)}</div>
      ) : items.length === 0 ? (
        <p className="mt-5 rounded-lg border bg-card/40 p-8 text-center text-sm text-muted-foreground">Nessuna immagine caricata.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((m) => (
            <div key={m.name} className="overflow-hidden rounded-lg border border-border/60 bg-background/40">
              <img src={m.url} alt={m.name} className="h-28 w-full object-cover" />
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={m.name}>{m.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => copy(m.url)} title="Copia URL" className="text-muted-foreground hover:text-foreground">
                    {copied === m.url ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => remove(m.name)} title="Elimina" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Impostazioni */

function SettingsPane() {
  const toast = useToast();
  const [s, setS] = useState<DocSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getDocSettings().then((d) => { setS(d); setLoading(false); }); }, []);

  const set = <K extends keyof DocSettings>(k: K, v: DocSettings[K]) => setS((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const { error } = await updateDocSettings({
      page_title: s.page_title, page_subtitle: s.page_subtitle,
      show_index: s.show_index, show_numbering: s.show_numbering,
    });
    setSaving(false);
    if (error) return toast.error(error);
    toast.success("Impostazioni salvate.");
  };

  if (loading) return <div className="h-48 animate-pulse rounded-xl border bg-card/40" />;
  if (!s) return <p className="rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">Impostazioni non disponibili.</p>;

  return (
    <div className="rounded-xl border bg-card/50 p-6">
      <h3 className="text-lg font-semibold">Impostazioni documentazione</h3>
      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label>Titolo pagina</Label>
          <Input value={s.page_title} onChange={(e) => set("page_title", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Sottotitolo / introduzione</Label>
          <textarea value={s.page_subtitle ?? ""} onChange={(e) => set("page_subtitle", e.target.value)} rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={s.show_index} onChange={(e) => set("show_index", e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
          Mostra l'indice in cima alla pagina
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={s.show_numbering} onChange={(e) => set("show_numbering", e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
          Mostra la numerazione nei titoli
        </label>
      </div>
      <Button onClick={save} disabled={saving} className="mt-6 bg-brand-gradient shadow-glow hover:opacity-90">
        <Save className="h-4 w-4" /> {saving ? "Salvataggio…" : "Salva impostazioni"}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ Profilo */

function ProfileEditor() {
  const toast = useToast();
  const [p, setP] = useState<AuthorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { getAuthorProfile().then((data) => { setP(data); setLoading(false); }); }, []);

  const set = <K extends keyof AuthorProfile>(k: K, v: AuthorProfile[K]) => setP((prev) => (prev ? { ...prev, [k]: v } : prev));
  const setContact = (i: number, patch: Partial<AuthorContact>) =>
    setP((prev) => prev ? { ...prev, contacts: prev.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : prev);
  const addContact = () => setP((prev) => prev ? { ...prev, contacts: [...prev.contacts, { label: "", value: "", href: "" }] } : prev);
  const removeContact = (i: number) => setP((prev) => prev ? { ...prev, contacts: prev.contacts.filter((_, j) => j !== i) } : prev);

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    const { url, error } = await uploadProfilePhoto(file);
    setUploading(false);
    if (error || !url) return toast.error(error ?? "Upload foto non riuscito.");
    set("photo_url", url);
    toast.success("Foto caricata. Ricorda di salvare.");
  };

  const save = async () => {
    if (!p) return;
    setSaving(true);
    const { error } = await updateAuthorProfile({
      display_name: p.display_name, headline: p.headline, bio: p.bio,
      photo_url: p.photo_url, email: p.email, location: p.location,
      contacts: p.contacts.filter((c) => c.label.trim() || c.value.trim()),
    });
    setSaving(false);
    if (error) return toast.error(error);
    toast.success("Profilo aggiornato.");
  };

  if (loading) return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  if (!p) return <p className="rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">Profilo non disponibile.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="rounded-xl border bg-card/50 p-6 shadow-card">
        <h3 className="text-lg font-semibold">Profilo pubblico — /chi-sono</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label>Nome visualizzato</Label><Input value={p.display_name} onChange={(e) => set("display_name", e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Headline</Label><Input value={p.headline ?? ""} onChange={(e) => set("headline", e.target.value)} placeholder="Cosa fai online" /></div>
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label>Biografia</Label>
          <textarea value={p.bio ?? ""} onChange={(e) => set("bio", e.target.value)} rows={6} placeholder="Racconta chi sei… (vai a capo per separare i paragrafi)"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label>Email pubblica</Label><Input value={p.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="nome@dominio.it" /></div>
          <div className="flex flex-col gap-1.5"><Label>Località</Label><Input value={p.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Città, Paese" /></div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <Label>Contatti aggiuntivi</Label>
            <Button variant="outline" size="sm" onClick={addContact}><Plus className="h-3.5 w-3.5" /> Aggiungi</Button>
          </div>
          <div className="mt-2 space-y-2">
            {p.contacts.length === 0 && <p className="text-xs text-muted-foreground">Nessun contatto aggiuntivo.</p>}
            {p.contacts.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Input value={c.label} onChange={(e) => setContact(i, { label: e.target.value })} placeholder="Etichetta (es. LinkedIn)" />
                <Input value={c.value} onChange={(e) => setContact(i, { value: e.target.value })} placeholder="Valore mostrato" />
                <Input value={c.href ?? ""} onChange={(e) => setContact(i, { href: e.target.value })} placeholder="Link (opzionale)" />
                <Button variant="outline" size="sm" onClick={() => removeContact(i)} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="mt-6 bg-brand-gradient shadow-glow hover:opacity-90"><Save className="h-4 w-4" /> {saving ? "Salvataggio…" : "Salva profilo"}</Button>
      </div>
      <aside className="h-fit rounded-xl border bg-card/50 p-6 shadow-card">
        <Label>Foto profilo</Label>
        <div className="mt-3 flex flex-col items-center gap-3">
          {p.photo_url ? (
            <img src={p.photo_url} alt="Foto profilo" className="h-32 w-32 rounded-full border border-border/70 object-cover" />
          ) : (
            <div className="grid h-32 w-32 place-items-center rounded-full border border-dashed border-border bg-background/40 text-muted-foreground"><User className="h-10 w-10" /></div>
          )}
          <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
            <ImageIcon className="h-4 w-4" /> {uploading ? "Caricamento…" : "Carica foto"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <p className="text-center text-xs text-muted-foreground">JPG o PNG. Salva il profilo per confermare.</p>
        </div>
      </aside>
    </div>
  );
}
