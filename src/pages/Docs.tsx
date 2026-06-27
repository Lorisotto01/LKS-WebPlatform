import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, MonitorDown, Server, Smartphone, KeyRound, ShieldCheck, Users,
  FolderSync, Bell, Lock, RefreshCw, Download, HelpCircle, Wifi, Info, AlertTriangle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { getDocSettings, getPublicDocBlocks, type DocBlock } from "@/lib/docs";
import type { DocSettings } from "@/types/database.types";

// Mappa nome icona (stringa salvata nei blocchi title) -> componente lucide.
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen, MonitorDown, Server, Smartphone, KeyRound, ShieldCheck, Users,
  FolderSync, Bell, Lock, RefreshCw, Download, HelpCircle, Wifi, Info, AlertTriangle,
};

// Slug per gli anchor dell'indice (dal testo del titolo).
function slug(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Render inline di **bold**, `code` e [testo](url).
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={i} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(<a key={i} href={mm[2]} className="text-primary hover:underline">{mm[1]}</a>);
    }
    last = m.index + tok.length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : fb);

export function Docs() {
  const [settings, setSettings] = useState<DocSettings | null>(null);
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDocSettings(), getPublicDocBlocks()]).then(([s, b]) => {
      setSettings(s); setBlocks(b); setLoading(false);
    });
  }, []);

  const titles = blocks.filter((b) => b.type === "title");
  const showIndex = settings?.show_index ?? true;
  const numbering = settings?.show_numbering ?? true;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 text-primary">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Documentazione</span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{settings?.page_title ?? "Documentazione"}</h1>
        {settings?.page_subtitle && <p className="mt-2 text-muted-foreground">{settings.page_subtitle}</p>}

        {loading ? (
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border bg-card/40" />)}
          </div>
        ) : blocks.length === 0 ? (
          <p className="mt-8 rounded-xl border bg-card/40 p-8 text-center text-muted-foreground">
            La documentazione non è ancora disponibile.
          </p>
        ) : (
          <>
            {showIndex && titles.length > 0 && (
              <nav className="mt-6 rounded-xl border bg-card/40 p-4 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Indice</p>
                <ol className="flex flex-col gap-1.5">
                  {titles.map((t) => (
                    <li key={t.id}>
                      <a href={`#${slug(str(t.content.text))}`} className="text-muted-foreground hover:text-foreground hover:underline">
                        {str(t.content.text)}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div className="mt-2">
              {blocks.map((b) => <BlockView key={b.id} block={b} numbering={numbering} />)}
            </div>
          </>
        )}

        <div className="mt-10 rounded-lg border border-border/60 bg-card/40 p-5 text-sm text-muted-foreground">
          Pronto a iniziare?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">Crea un account</Link>{" "}
          e scarica l'ultima versione dalla dashboard.
        </div>
      </main>
    </div>
  );
}

function BlockView({ block, numbering }: { block: DocBlock; numbering: boolean }) {
  const c = block.content;
  switch (block.type) {
    case "title": {
      const Icon = ICONS[str(c.icon, "BookOpen")] ?? BookOpen;
      const text = str(c.text);
      return (
        <h2 id={slug(text)} className="mt-10 flex scroll-mt-20 items-center gap-2 text-xl font-bold">
          <Icon className="h-5 w-5 text-primary" /> {numbering ? text : text.replace(/^\d+\.\s*/, "")}
        </h2>
      );
    }
    case "paragraph":
      return <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{renderInline(str(c.text))}</p>;
    case "image":
      return str(c.url) ? (
        <figure className="mt-4">
          <img src={str(c.url)} alt={str(c.alt)} className="w-full rounded-lg border border-border/60" />
          {str(c.caption) && <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">{str(c.caption)}</figcaption>}
        </figure>
      ) : null;
    case "note":
      return (
        <div className="mt-3 flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 whitespace-pre-line break-words">{renderInline(str(c.text))}</div>
        </div>
      );
    case "warning":
      return (
        <div className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div className="min-w-0 whitespace-pre-line break-words">{renderInline(str(c.text))}</div>
        </div>
      );
    case "list": {
      const items = Array.isArray(c.items) ? (c.items as unknown[]).map((x) => String(x)) : [];
      const ordered = Boolean(c.ordered);
      const cls = "mt-3 space-y-1.5 text-sm text-muted-foreground";
      return ordered ? (
        <ol className={`${cls} list-decimal break-words pl-5`}>{items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}</ol>
      ) : (
        <ul className={`${cls} break-words`}>{items.map((it, i) => (
          <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span className="min-w-0">{renderInline(it)}</span></li>
        ))}</ul>
      );
    }
    case "table": {
      const rows = Array.isArray(c.rows) ? (c.rows as unknown[]).map((r) => (Array.isArray(r) ? (r as unknown[]).map((x) => String(x)) : [])) : [];
      if (rows.length === 0) return null;
      const header = Boolean(c.header);
      const body = header ? rows.slice(1) : rows;
      return (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            {header && (
              <thead className="bg-card/60"><tr>{rows[0].map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
            )}
            <tbody>{body.map((r, ri) => (
              <tr key={ri} className="border-t border-border/40">{r.map((cell, ci) => <td key={ci} className="px-3 py-2 text-muted-foreground">{cell}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      );
    }
    case "code":
      return <pre className="my-3 overflow-x-auto rounded-lg border bg-card/50 p-3 font-mono text-sm text-muted-foreground">{str(c.code)}</pre>;
    case "divider":
      return <hr className="my-6 border-border/50" />;
    default:
      return null;
  }
}
