import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  History, Search, ChevronDown, ListTree, X, Monitor, Globe, Cloud, Server,
  Terminal, BookOpen, Circle, Sparkles, CalendarDays, Hammer,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  MODULES, moduleMeta, parseChangelog, formatChangelogDate,
  type ChangelogVersion, type ModuleId, type ModuleMeta,
} from "@/lib/changelog";

/* ------------------------------------------------------------------ *
 * Markdown minimale (solo ciò che compare in CHANGELOG.md)
 * ------------------------------------------------------------------ */

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(
        <code key={i} className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={i} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={i}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Un elenco puntato del markdown può spezzarsi su più righe (continuazioni
 * indentate): qui vengono ricucite prima del rendering, così ogni voce resta
 * un unico paragrafo e non tre frasi mozzate.
 */
function joinWrapped(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const isBullet = /^\s*[-*]\s+/.test(line);
    const isBlank = line.trim() === "";
    const isSpecial = isBullet || isBlank || /^\s*(#{1,6}\s|```|\||>)/.test(line);
    const prev = out[out.length - 1];
    const prevIsFlow = prev !== undefined && prev.trim() !== "" && !/^\s*(```|\|)/.test(prev);
    if (!isSpecial && prevIsFlow && /^\s+\S/.test(line)) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out;
}

function renderMarkdown(lines: string[]): ReactNode[] {
  const src = joinWrapped(lines);
  const blocks: ReactNode[] = [];
  let bullets: { depth: number; text: string }[] = [];
  let key = 0;

  const flushList = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key++} className="my-2 space-y-1.5">
        {items.map((b, i) => (
          <li
            key={i}
            className="flex gap-2 text-[0.8125rem] leading-relaxed text-muted-foreground sm:text-sm"
            style={{ paddingLeft: `${b.depth * 0.75}rem` }}
          >
            <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-primary/70" />
            <span className="min-w-0 break-words">{renderInline(b.text)}</span>
          </li>
        ))}
      </ul>
    );
  };

  for (let i = 0; i < src.length; i++) {
    const line = src[i];

    if (line.trim().startsWith("```")) {
      flushList();
      const buf: string[] = [];
      i++;
      while (i < src.length && !src[i].trim().startsWith("```")) buf.push(src[i++]);
      blocks.push(
        <pre key={key++} className="my-3 overflow-x-auto rounded-lg border bg-background/50 p-3 font-mono text-xs text-muted-foreground">
          {buf.join("\n")}
        </pre>
      );
      continue;
    }

    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push({ depth: Math.floor(bullet[1].length / 2), text: bullet[2] });
      continue;
    }

    flushList();

    if (line.startsWith("#### ")) {
      blocks.push(<h4 key={key++} className="mt-5 text-sm font-semibold text-foreground">{renderInline(line.slice(5))}</h4>);
    } else if (line.startsWith("> ")) {
      blocks.push(
        <p key={key++} className="my-2 border-l-2 border-primary/40 pl-3 text-[0.8125rem] italic text-muted-foreground sm:text-sm">
          {renderInline(line.slice(2))}
        </p>
      );
    } else if (line.trim().startsWith("|")) {
      blocks.push(
        <p key={key++} className="overflow-x-auto whitespace-pre font-mono text-xs text-muted-foreground">{line}</p>
      );
    } else if (line.trim() !== "") {
      blocks.push(
        <p key={key++} className="my-2 break-words text-[0.8125rem] leading-relaxed text-muted-foreground sm:text-sm">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushList();
  return blocks;
}

/* ------------------------------------------------------------------ *
 * Presentazione degli applicativi
 * ------------------------------------------------------------------ */

const MODULE_ICONS = {
  monitor: Monitor, globe: Globe, cloud: Cloud, server: Server,
  terminal: Terminal, book: BookOpen, dot: Circle,
} as const;

/** Solo token già presenti nella palette: nessun colore nuovo. */
const TONE: Record<ModuleMeta["tone"], { chip: string; icon: string; ring: string }> = {
  primary: { chip: "bg-primary/15 text-primary", icon: "bg-primary/10 text-primary", ring: "border-primary/30" },
  success: { chip: "bg-success/15 text-success", icon: "bg-success/10 text-success", ring: "border-success/30" },
  warning: { chip: "bg-warning/15 text-warning", icon: "bg-warning/10 text-warning", ring: "border-warning/30" },
  neutral: { chip: "bg-muted text-muted-foreground", icon: "bg-muted text-muted-foreground", ring: "border-border" },
};

function ModuleIcon({ meta, className }: { meta: ModuleMeta; className?: string }) {
  const Icon = MODULE_ICONS[meta.icon];
  return <Icon className={className ?? "h-4 w-4"} />;
}

/* ------------------------------------------------------------------ *
 * Pagina
 * ------------------------------------------------------------------ */

export function Changelog() {
  const location = useLocation();
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [modules, setModules] = useState<ModuleId[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const sections = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    fetch("/CHANGELOG.md")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(setMd)
      .catch(() => setError(true));
  }, []);

  const parsed = useMemo(() => (md ? parseChangelog(md) : null), [md]);

  /** Versioni filtrate per applicativo e per testo cercato. */
  const versions = useMemo<ChangelogVersion[]>(() => {
    if (!parsed) return [];
    const q = query.trim().toLowerCase();
    const wanted = new Set(modules);
    return parsed.versions
      .map((v) => {
        const groups = v.groups
          .filter((g) => wanted.size === 0 || wanted.has(g.module))
          .map((g) => ({
            ...g,
            entries: q
              ? g.entries.filter(
                  (e) =>
                    e.title.toLowerCase().includes(q) ||
                    v.version.toLowerCase().includes(q) ||
                    e.body.join("\n").toLowerCase().includes(q)
                )
              : g.entries,
          }))
          .filter((g) => g.entries.length > 0);
        return { ...v, groups, entryCount: groups.reduce((n, g) => n + g.entries.length, 0) };
      })
      .filter((v) => v.entryCount > 0);
  }, [parsed, query, modules]);

  /** Slug dell'ultima versione rilasciata, indipendente dai filtri attivi. */
  const latestSlug = useMemo(
    () => parsed?.versions.find((v) => !v.unreleased)?.slug ?? null,
    [parsed]
  );

  /** Applicativi effettivamente presenti nel file, per i chip di filtro. */
  const availableModules = useMemo(() => {
    if (!parsed) return [];
    const seen = new Set<ModuleId>();
    for (const v of parsed.versions) for (const g of v.groups) seen.add(g.module);
    return MODULES.filter((m) => seen.has(m.id));
  }, [parsed]);

  /**
   * Lo scroll va rimandato: al montaggio lo `ScrollToTop` globale riporta la
   * pagina in cima, e la sezione bersaglio deve prima espandersi.
   */
  const scrollToSlug = useCallback((slug: string) => {
    setTimeout(() => {
      sections.current.get(slug)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 120);
  }, []);

  // Prima apertura: espandi la versione richiesta nell'hash, altrimenti la più recente.
  const applied = useRef(false);
  useEffect(() => {
    if (!parsed || applied.current || parsed.versions.length === 0) return;
    applied.current = true;
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    const target = parsed.versions.find((v) => v.slug === hash);
    const first = target ?? parsed.versions[0];
    setOpen(new Set([first.slug]));
    setActive(first.slug);
    if (target) scrollToSlug(target.slug);
  }, [parsed, location.hash, scrollToSlug]);

  // Una ricerca attiva apre tutte le versioni rimaste: i risultati devono essere visibili.
  useEffect(() => {
    if (query.trim() === "") return;
    setOpen(new Set(versions.map((v) => v.slug)));
  }, [query, versions]);

  // Evidenzia nell'indice la versione in vista.
  useEffect(() => {
    if (versions.length === 0) return;
    const obs = new IntersectionObserver(
      (es) => {
        const top = es
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-72px 0px -65% 0px", threshold: 0 }
    );
    for (const el of sections.current.values()) obs.observe(el);
    return () => obs.disconnect();
  }, [versions]);

  const registerSection = useCallback((slug: string, el: HTMLElement | null) => {
    if (el) sections.current.set(slug, el);
    else sections.current.delete(slug);
  }, []);

  const toggleVersion = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const goTo = (slug: string) => {
    setOpen((prev) => new Set(prev).add(slug));
    setIndexOpen(false);
    scrollToSlug(slug);
  };

  const toggleModule = (id: ModuleId) =>
    setModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const hasFilters = query.trim() !== "" || modules.length > 0;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-3 py-8 sm:px-6 sm:py-12">
        {/* ============ Intestazione ============ */}
        <header>
          <div className="flex items-center gap-2 text-primary">
            <History className="h-5 w-5 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider">Changelog</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Cosa è cambiato, versione per versione
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Ogni aggiornamento è suddiviso per applicativo, così vedi subito se riguarda il
            programma sul tuo computer, le pagine che apri dal browser o questo sito.
          </p>
          {parsed?.currentVersion && (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /> Versione corrente {parsed.currentVersion}
            </span>
          )}
        </header>

        {error ? (
          <p className="mt-8 rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">
            Changelog non disponibile al momento.
          </p>
        ) : !parsed ? (
          <div className="mt-8 animate-pulse space-y-3">
            <div className="h-12 rounded-lg border bg-card/40" />
            <div className="h-40 rounded-xl border bg-card/30" />
            <div className="h-40 rounded-xl border bg-card/20" />
          </div>
        ) : (
          <>
            {/* ============ Ricerca + filtri per applicativo ============ */}
            <div className="mt-8 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                {/* type="text": con "search" Chrome aggiunge una seconda X nativa. */}
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca una modifica o una versione…"
                  aria-label="Cerca nel changelog"
                  className="h-10 w-full rounded-lg border border-input bg-card/50 pl-9 pr-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Cancella ricerca"
                    className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {availableModules.map((m) => {
                  const on = modules.includes(m.id);
                  const tone = TONE[m.tone];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleModule(m.id)}
                      aria-pressed={on}
                      title={m.hint}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        on ? `${tone.chip} ${tone.ring}` : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ModuleIcon meta={m} className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setModules([]); }}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <X className="h-3.5 w-3.5" /> Azzera filtri
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
              {/* ============ Indice versioni ============ */}
              <aside className="lg:sticky lg:top-20 lg:self-start">
                {/* <lg: pannello a comparsa, così l'indice non ruba mezzo schermo */}
                <button
                  type="button"
                  onClick={() => setIndexOpen((v) => !v)}
                  aria-expanded={indexOpen}
                  className="flex w-full items-center gap-2 rounded-lg border bg-card/50 px-3 py-2.5 text-sm font-medium lg:hidden"
                >
                  <ListTree className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">Indice versioni</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{versions.length}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${indexOpen ? "rotate-180" : ""}`} />
                </button>

                <div className={`${indexOpen ? "mt-2 block" : "hidden"} lg:mt-0 lg:block`}>
                  <p className="hidden items-center gap-2 px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 lg:flex">
                    <ListTree className="h-3.5 w-3.5 shrink-0" /> Indice versioni
                  </p>
                  <nav
                    aria-label="Indice delle versioni"
                    className="max-h-[60vh] overflow-y-auto rounded-lg border bg-card/40 p-1.5 lg:max-h-[calc(100vh-10rem)] lg:border-0 lg:bg-transparent lg:p-0"
                  >
                    <ul className="space-y-0.5">
                      {versions.map((v) => {
                        const on = active === v.slug;
                        return (
                          <li key={v.slug}>
                            <button
                              type="button"
                              onClick={() => goTo(v.slug)}
                              aria-current={on ? "true" : undefined}
                              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                                on ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-primary" : "bg-border"}`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-mono text-[0.8125rem] font-semibold">
                                  {v.unreleased ? "In lavorazione" : v.version}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {formatChangelogDate(v.date) ?? `${v.entryCount} modifiche`}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </nav>
                </div>
              </aside>

              {/* ============ Elenco versioni ============ */}
              <div className="min-w-0">
                {versions.length === 0 ? (
                  <p className="rounded-xl border bg-card/40 p-6 text-sm text-muted-foreground">
                    Nessuna modifica corrisponde ai filtri attivi.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {versions.map((v) => (
                      <VersionBlock
                        key={v.slug}
                        version={v}
                        // "Ultima" si calcola sull'elenco completo: con un filtro
                        // attivo la prima riga visibile non è l'ultima release.
                        latest={v.slug === latestSlug}
                        open={open.has(v.slug)}
                        onToggle={() => toggleVersion(v.slug)}
                        register={registerSection}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Blocco di una versione
 * ------------------------------------------------------------------ */

function VersionBlock({
  version: v, latest, open, onToggle, register,
}: {
  version: ChangelogVersion;
  latest: boolean;
  open: boolean;
  onToggle: () => void;
  register: (slug: string, el: HTMLElement | null) => void;
}) {
  const date = formatChangelogDate(v.date);
  return (
    <section
      id={v.slug}
      ref={(el) => register(v.slug, el)}
      className="scroll-mt-20 overflow-hidden rounded-xl border bg-card/50 shadow-card"
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-start gap-2.5 p-3.5 text-left transition-colors hover:bg-card/70 sm:gap-3 sm:p-5"
        >
          <span
            aria-hidden
            className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 ${
              v.unreleased ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
            }`}
          >
            {v.unreleased ? <Hammer className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-base font-bold tracking-tight sm:text-lg">
                {v.unreleased ? "In lavorazione" : v.version}
              </span>
              {latest && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Sparkles className="h-3 w-3" /> Ultima
                </span>
              )}
              {v.unreleased && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  non ancora rilasciata
                </span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {date && <span>{date}</span>}
              {date && <span aria-hidden>·</span>}
              <span>{v.entryCount} {v.entryCount === 1 ? "modifica" : "modifiche"}</span>
            </span>
            {/* Anteprima degli applicativi toccati: leggibile anche a blocco chiuso. */}
            <span className="mt-2 flex flex-wrap gap-1">
              {v.groups.map((g) => {
                const meta = moduleMeta(g.module);
                return (
                  <span
                    key={g.module}
                    className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE[meta.tone].chip}`}
                  >
                    <ModuleIcon meta={meta} className="h-3 w-3 shrink-0" />
                    <span className="truncate">{meta.label}</span>
                    <span className="opacity-70">{g.entries.length}</span>
                  </span>
                );
              })}
            </span>
          </span>

          <ChevronDown
            aria-hidden
            className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>

      {open && (
        <div className="border-t border-border/60 p-3.5 sm:p-5">
          {v.summary.some((l) => l.trim() !== "") && (
            <div className="mb-4 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              {renderMarkdown(v.summary)}
            </div>
          )}

          <div className="space-y-4">
            {v.groups.map((g) => {
              const meta = moduleMeta(g.module);
              const tone = TONE[meta.tone];
              return (
                <div key={g.module} className={`rounded-lg border ${tone.ring} bg-background/30`}>
                  <div className="flex items-start gap-2.5 border-b border-border/50 p-3 sm:p-4">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${tone.icon}`}>
                      <ModuleIcon meta={meta} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                        <span className="min-w-0 break-words">{meta.label}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                          {g.entries.length}
                        </span>
                      </p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">{meta.hint}</p>
                    </div>
                  </div>

                  <div className="divide-y divide-border/40">
                    {g.entries.map((e, i) => (
                      <article key={i} className="p-3 sm:p-4">
                        <h3 className="break-words text-sm font-semibold text-foreground">
                          {renderInline(e.title || "Modifiche varie")}
                        </h3>
                        {/* Scope secondari: la voce tocca più di un applicativo. */}
                        {e.scopes.length > 1 && (
                          <p className="mt-1.5 flex flex-wrap gap-1">
                            {e.scopes.map((s) => (
                              <span key={s} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {s}
                              </span>
                            ))}
                          </p>
                        )}
                        <div className="mt-1">{renderMarkdown(e.body)}</div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
