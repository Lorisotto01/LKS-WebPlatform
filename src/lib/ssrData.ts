/**
 * Dati iniziali delle pagine prerenderizzate (task SEO 869fg1w4z / 869fg20jx, v5.1.0).
 *
 * Docs, Chi sono e Changelog caricano il contenuto a runtime (Supabase o /CHANGELOG.md): senza questo
 * modulo l'HTML statico conteneva solo lo scheletro di caricamento, e per un crawler quelle pagine
 * erano vuote. Ora scripts/prerender.mjs carica i dati al build e li mette in `ssrData.current`
 * prima di renderizzare; le pagine li usano come stato iniziale.
 *
 * Lo stesso oggetto viene incorporato nell'HTML come <script type="application/json" id="ssr-data">:
 * nel browser lo stato iniziale coincide con quello del server, quindi l'idratazione combacia. È un
 * blocco dati e non uno script eseguibile, perciò non richiede eccezioni alla Content-Security-Policy.
 *
 * Le pagine continuano comunque a ricaricare i dati dopo il mount: quelli del build possono essere
 * vecchi, servono solo al primo disegno e ai crawler.
 */
import type { ModuleId } from "./changelog";
import type { DocBlock } from "./docs";
import type { AuthorProfile, DocSettings } from "@/types/database.types";

export interface SsrData {
  /** Inizio del CHANGELOG (ultime versioni): il file intero arriva poi con il fetch. */
  changelog?: string;
  /** Applicativi citati nel CHANGELOG intero, per non far cambiare i chip di filtro all'arrivo del file. */
  changelogModules?: ModuleId[];
  docs?: { settings: DocSettings | null; blocks: DocBlock[] };
  author?: AuthorProfile | null;
}

/** Dati del render lato server, impostati da scripts/prerender.mjs per ogni route. */
export const ssrData: { current: SsrData } = { current: {} };

let browserData: SsrData | undefined;

/** Dato precaricato per la pagina servita, o undefined se la pagina non è arrivata prerenderizzata. */
export function initialData<K extends keyof SsrData>(key: K): SsrData[K] | undefined {
  if (typeof window === "undefined") return ssrData.current[key];
  if (browserData === undefined) {
    try {
      browserData = JSON.parse(document.getElementById("ssr-data")?.textContent || "{}") as SsrData;
    } catch {
      browserData = {};
    }
  }
  return browserData[key];
}
