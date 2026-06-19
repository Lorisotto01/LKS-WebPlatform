import { useEffect, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { Navbar } from "@/components/Navbar";

// Render inline `code` e **bold** dentro una riga di testo.
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>
      );
    } else {
      out.push(
        <strong key={i} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} className="my-3 overflow-x-auto rounded-lg border bg-card/50 p-3 font-mono text-xs text-muted-foreground">
          {buf.join("\n")}
        </pre>
      );
      continue;
    }

    if (line.startsWith("#### ")) {
      blocks.push(<h4 key={key++} className="mt-6 text-sm font-semibold text-foreground">{renderInline(line.slice(5))}</h4>);
    } else if (line.startsWith("### ")) {
      blocks.push(<h3 key={key++} className="mt-8 font-mono text-lg font-bold tracking-tight">{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h2 key={key++} className="mt-8 text-xl font-bold">{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      blocks.push(<h1 key={key++} className="text-2xl font-extrabold tracking-tight">{renderInline(line.slice(2))}</h1>);
    } else if (line.trim() === "---") {
      blocks.push(<hr key={key++} className="my-6 border-border/50" />);
    } else if (line.startsWith(">")) {
      blocks.push(
        <p key={key++} className="border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
          {renderInline(line.replace(/^>\s?/, ""))}
        </p>
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      const indent = line.length - line.trimStart().length;
      blocks.push(
        <p key={key++} className="flex gap-2 text-sm" style={{ paddingLeft: `${0.5 + indent * 0.4}rem` }}>
          <span className="text-primary">›</span>
          <span>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</span>
        </p>
      );
    } else if (line.trim().startsWith("|")) {
      blocks.push(
        <p key={key++} className="overflow-x-auto whitespace-pre font-mono text-xs text-muted-foreground">
          {line}
        </p>
      );
    } else if (line.trim() === "") {
      // skip blank lines (spacing handled by margins)
    } else {
      blocks.push(<p key={key++} className="text-sm leading-relaxed text-muted-foreground">{renderInline(line)}</p>);
    }
    i++;
  }
  return blocks;
}

// Mostra solo l'elenco versioni/modifiche: scarta l'intestazione del file
// (titolo, legenda versioning, ecc.) fino alla prima voce "## [...]".
function stripHeader(md: string): string {
  const m = md.match(/^## \[/m);
  return m && m.index !== undefined ? md.slice(m.index) : md;
}

export function Changelog() {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/CHANGELOG.md")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(setMd)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 text-primary">
          <History className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Changelog</span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Note di rilascio</h1>

        {error ? (
          <p className="mt-8 rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">
            Changelog non disponibile al momento.
          </p>
        ) : md === null ? (
          <p className="mt-8 text-sm text-muted-foreground">Caricamento…</p>
        ) : (
          <div className="mt-6">{renderMarkdown(stripHeader(md))}</div>
        )}
      </main>
    </div>
  );
}
