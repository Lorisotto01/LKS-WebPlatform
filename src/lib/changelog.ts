/**
 * Parser di `public/CHANGELOG.md` per la pagina /changelog.
 *
 * Il file resta la fonte di verità tecnica e non viene modificato: qui viene
 * solo destrutturato in versioni → applicativi → voci, così la pagina può
 * costruire l'indice, i filtri per applicativo e i link profondi (#v4-8-2).
 *
 * Struttura attesa del markdown:
 *   ## [4.8.2] — 2026-09-12          → versione (## [Non rilasciato] = in lavorazione)
 *   ### `desktop` — titolo           → voce, con uno o più scope fra backtick
 *   ### `webapp` / `desktop` — ...   → voce multi-scope (conta sul primo)
 *   ### Edge Functions               → voce senza scope, mappata per parola chiave
 */

export type ModuleId =
  | "desktop"
  | "webapp"
  | "webplatform"
  | "services"
  | "tools"
  | "docs"
  | "other";

export interface ModuleMeta {
  id: ModuleId;
  /** Nome leggibile da utente non tecnico. */
  label: string;
  /** Una riga che spiega di che pezzo di prodotto si tratta. */
  hint: string;
  /** Tono cromatico: solo token già presenti nella palette. */
  tone: "primary" | "success" | "warning" | "neutral";
  /** Nome dell'icona lucide usata dalla pagina. */
  icon: "monitor" | "globe" | "cloud" | "server" | "terminal" | "book" | "dot";
}

/** Ordine di visualizzazione dei gruppi dentro una versione. */
export const MODULES: ModuleMeta[] = [
  {
    id: "desktop",
    label: "App desktop",
    hint: "Il programma che installi sul computer.",
    tone: "primary",
    icon: "monitor",
  },
  {
    id: "webapp",
    label: "Interfaccia da browser",
    hint: "Le pagine che apri da telefono o da un altro PC della rete.",
    tone: "success",
    icon: "globe",
  },
  {
    id: "webplatform",
    label: "Sito e area personale",
    hint: "Questo sito: account, acquisti, download e licenze.",
    tone: "warning",
    icon: "cloud",
  },
  {
    id: "services",
    label: "Servizi e archivio dati",
    hint: "La parte che lavora dietro le quinte: database e servizi online.",
    tone: "neutral",
    icon: "server",
  },
  {
    id: "tools",
    label: "Strumenti interni",
    hint: "Utilità riservate all'autore, non incluse nel prodotto.",
    tone: "neutral",
    icon: "terminal",
  },
  {
    id: "docs",
    label: "Documentazione",
    hint: "Guide, manuali e testi del sito.",
    tone: "neutral",
    icon: "book",
  },
  {
    id: "other",
    label: "Note generali",
    hint: "Indicazioni valide per l'aggiornamento nel suo insieme.",
    tone: "neutral",
    icon: "dot",
  },
];

const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export function moduleMeta(id: ModuleId): ModuleMeta {
  return MODULE_BY_ID.get(id) ?? MODULES[MODULES.length - 1];
}

/** Scope fra backtick → applicativo. */
const SCOPE_TO_MODULE: Record<string, ModuleId> = {
  desktop: "desktop",
  webapp: "webapp",
  webplatform: "webplatform",
  db: "services",
  api: "services",
  supabase: "services",
  "tool-cli": "tools",
  cli: "tools",
  docs: "docs",
  core: "other",
};

/** Titoli senza scope: si classificano per parola chiave. */
const KEYWORD_TO_MODULE: [RegExp, ModuleId][] = [
  [/edge function/i, "services"],
  [/document/i, "docs"],
  [/desktop/i, "desktop"],
  [/webapp/i, "webapp"],
  [/webplatform/i, "webplatform"],
];

export interface ChangelogEntry {
  /**
   * Titolo della voce, senza gli scope iniziali. Vuoto quando l'intestazione
   * nel file contiene solo scope (`### \`webapp\``): la pagina mette allora
   * un'etichetta generica, gli scope restano visibili come targhette.
   */
  title: string;
  /** Scope originali dichiarati nell'intestazione (`desktop`, `db`, …). */
  scopes: string[];
  /** Applicativo in cui la voce viene raggruppata. */
  module: ModuleId;
  /** Righe markdown del corpo (elenchi, paragrafi, tabelle, code fence). */
  body: string[];
}

export interface ChangelogGroup {
  module: ModuleId;
  entries: ChangelogEntry[];
}

export interface ChangelogVersion {
  /** Ancora usata nell'URL, es. `v4-8-2` o `non-rilasciato`. */
  slug: string;
  /** Etichetta mostrata, es. `4.8.2` o `Non rilasciato`. */
  version: string;
  /** Data ISO grezza presente nel file, se dichiarata. */
  date: string | null;
  /** true per la sezione `[Non rilasciato]`. */
  unreleased: boolean;
  /** Righe che precedono la prima voce: sommario dell'aggiornamento. */
  summary: string[];
  groups: ChangelogGroup[];
  /** Numero totale di voci, per i contatori dell'indice. */
  entryCount: number;
}

export interface ParsedChangelog {
  versions: ChangelogVersion[];
  /** Versione dichiarata come corrente nell'intestazione del file, se presente. */
  currentVersion: string | null;
}

function slugify(version: string): string {
  const s = version
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^\d/.test(s) ? `v${s}` : s;
}

/**
 * Estrae gli scope fra backtick all'inizio di un'intestazione `###` e
 * restituisce il titolo ripulito dal separatore (`—`, `–`, `-`).
 */
function splitHeading(raw: string): { scopes: string[]; title: string } {
  const scopes: string[] = [];
  let rest = raw.trim();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const m = rest.match(/^`([^`]+)`\s*/);
    if (!m) break;
    scopes.push(m[1].trim().toLowerCase());
    rest = rest.slice(m[0].length);
    const sep = rest.match(/^[/&+]\s*/);
    if (sep) rest = rest.slice(sep[0].length);
    else break;
  }
  // Nel file i titoli seguono lo scope in minuscolo ("`desktop` — cartella
  // runtime spostata…"): staccati da lì diventano frasi, e vanno maiuscoli.
  const title = rest.replace(/^\s*[—–-]\s*/, "").trim();
  const upper = /^[a-zà-ÿ]/.test(title) ? title[0].toUpperCase() + title.slice(1) : title;
  return { scopes, title: upper };
}

function moduleFor(scopes: string[], title: string): ModuleId {
  for (const s of scopes) {
    const m = SCOPE_TO_MODULE[s];
    if (m) return m;
  }
  for (const [re, id] of KEYWORD_TO_MODULE) {
    if (re.test(title)) return id;
  }
  return "other";
}

/** Ordina i gruppi secondo MODULES, scartando quelli vuoti. */
function orderGroups(map: Map<ModuleId, ChangelogEntry[]>): ChangelogGroup[] {
  const out: ChangelogGroup[] = [];
  for (const m of MODULES) {
    const entries = map.get(m.id);
    if (entries && entries.length > 0) out.push({ module: m.id, entries });
  }
  return out;
}

export function parseChangelog(md: string): ParsedChangelog {
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  const versions: ChangelogVersion[] = [];
  let currentVersion: string | null = null;

  let version: ChangelogVersion | null = null;
  let groupMap = new Map<ModuleId, ChangelogEntry[]>();
  let entry: ChangelogEntry | null = null;
  let inFence = false;
  const usedSlugs = new Set<string>();

  const closeVersion = () => {
    if (!version) return;
    version.groups = orderGroups(groupMap);
    version.entryCount = version.groups.reduce((n, g) => n + g.entries.length, 0);
    // Sommario e corpi: via le righe vuote in coda.
    while (version.summary.length && version.summary[version.summary.length - 1].trim() === "")
      version.summary.pop();
    versions.push(version);
    version = null;
    entry = null;
  };

  for (const line of lines) {
    // Dentro un blocco di codice nessuna riga è un'intestazione.
    if (line.trim().startsWith("```")) inFence = !inFence;

    if (!inFence) {
      const h2 = line.match(/^##\s+\[([^\]]+)\](?:\s*[—–-]\s*(.+))?\s*$/);
      if (h2) {
        closeVersion();
        const label = h2[1].trim();
        let slug = slugify(label);
        let n = 2;
        while (usedSlugs.has(slug)) slug = `${slugify(label)}-${n++}`;
        usedSlugs.add(slug);
        groupMap = new Map();
        version = {
          slug,
          version: label,
          date: h2[2]?.trim() || null,
          unreleased: /non\s*rilasciat/i.test(label),
          summary: [],
          groups: [],
          entryCount: 0,
        };
        continue;
      }

      const h3 = line.match(/^###\s+(.+?)\s*$/);
      if (h3 && version) {
        const { scopes, title } = splitHeading(h3[1]);
        entry = {
          title: scopes.length > 0 ? title : title || h3[1].trim(),
          scopes,
          module: moduleFor(scopes, title || h3[1]),
          body: [],
        };
        const list = groupMap.get(entry.module) ?? [];
        list.push(entry);
        groupMap.set(entry.module, list);
        continue;
      }

      // Il separatore fra versioni non fa parte di nessun corpo.
      if (line.trim() === "---" && version) continue;
    }

    if (!version) {
      const cur = line.match(/Versione corrente:\s*\*\*([^*]+)\*\*/i);
      if (cur) currentVersion = cur[1].trim();
      continue;
    }
    if (entry) entry.body.push(line);
    else version.summary.push(line);
  }
  closeVersion();

  // Via le righe vuote in coda ai corpi delle voci.
  for (const v of versions)
    for (const g of v.groups)
      for (const e of g.entries)
        while (e.body.length && e.body[e.body.length - 1].trim() === "") e.body.pop();

  return { versions, currentVersion };
}

/** Data ISO → "12 settembre 2026". Ritorna null se non parsabile. */
export function formatChangelogDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Ancora della pagina changelog per una versione di release (`v4.8.2`, `4.8.2`).
 * Usata dalla dashboard per il link "Note di rilascio".
 */
export function changelogAnchor(version: string): string {
  return `/changelog#${slugify(version.replace(/^v/i, ""))}`;
}
