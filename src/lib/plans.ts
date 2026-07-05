/**
 * Catalogo piani — single source of truth lato WebPlatform (v4.4.0).
 *
 * Rispecchia il seed di `supabase/migrations/0015_v440_plans.sql`. Tenere i due
 * allineati: il DB è autorevole per gating/contabilità, questo modulo alimenta la
 * pagina /pricing (statica, senza round-trip) e la logica di confronto piani.
 *
 * Prezzi espressi in euro (numeri), lock in euro interi.
 */

export type PlanCode = "free" | "essential" | "pro";

/** Ordine crescente: usato per confronti "il piano X sblocca la feature". */
export const PLAN_ORDER: PlanCode[] = ["free", "essential", "pro"];

export function planRank(code: PlanCode): number {
  return PLAN_ORDER.indexOf(code);
}

/** true se `owned` sblocca ciò che richiede almeno `required`. */
export function planUnlocks(owned: PlanCode, required: PlanCode): boolean {
  return planRank(owned) >= planRank(required);
}

export interface PlanFeature {
  key: string;
  label: string;
  /** Piano minimo che sblocca la feature. */
  minPlan: PlanCode;
  category: "password" | "localdrop" | "licensing" | "general";
}

export interface LockPricing {
  /** Prezzo ENV_LOCK già scontato (€). */
  envLock: number;
  /** Prezzo PERMANENT_LOCK già scontato (€). */
  permLock: number;
  /** Sconto % rispetto al prezzo pieno (piano Free), per messaggi marketing. */
  envDiscountPct: number;
  permDiscountPct: number;
}

export interface Plan {
  code: PlanCode;
  name: string;
  tagline: string;
  priceMonth: number;   // €/mese
  priceYear: number;    // €/anno
  maxUsers: number | null;   // null = illimitato
  maxFolders: number | null; // null = illimitato
  maxUploadGb: number;
  recommended: boolean;
  lock: LockPricing;
  /** Punti elenco mostrati nella card (in ordine). */
  highlights: string[];
}

/** Prezzi pieni dei LOCK (piano Free) — base per il calcolo degli sconti. */
const LOCK_FULL = { envLock: 120, permLock: 100 };

function lock(envLock: number, permLock: number): LockPricing {
  return {
    envLock,
    permLock,
    envDiscountPct: Math.round((1 - envLock / LOCK_FULL.envLock) * 100),
    permDiscountPct: Math.round((1 - permLock / LOCK_FULL.permLock) * 100),
  };
}

export const PLANS: Plan[] = [
  {
    code: "free",
    name: "Free",
    tagline: "Per iniziare, sempre gratis",
    priceMonth: 0,
    priceYear: 0,
    maxUsers: 3,
    maxFolders: 3,
    maxUploadGb: 5,
    recommended: false,
    lock: lock(120, 100),
    highlights: [
      "Fino a 3 utenti per licenza",
      "Password e categorie credenziali",
      "Condivisione password",
      "LocalDrop Free · file fino a 5 GB",
      "Testo rapido e fino a 3 cartelle",
    ],
  },
  {
    code: "essential",
    name: "Essential",
    tagline: "Più spazio e collaborazione",
    priceMonth: 4.99,
    priceYear: 50,
    maxUsers: 8,
    maxFolders: null,
    maxUploadGb: 10,
    recommended: true,
    lock: lock(102, 65),
    highlights: [
      "Tutto del piano Free",
      "Fino a 8 utenti per licenza",
      "LocalDrop Essential · file fino a 10 GB",
      "Cartelle illimitate e categorie documenti",
      "Caricamento archivi .zip / .rar",
      "Condivisione file",
      "Accesso API (su richiesta)",
    ],
  },
  {
    code: "pro",
    name: "Pro",
    tagline: "Nessun limite, massima potenza",
    priceMonth: 9.99,
    priceYear: 100,
    maxUsers: null,
    maxFolders: null,
    maxUploadGb: 20,
    recommended: false,
    lock: lock(60, 10),
    highlights: [
      "Tutto del piano Essential",
      "Utenti illimitati",
      "LocalDrop Pro · file fino a 20 GB",
      "Archiviazione e compressione cartelle",
      "Assistenza prioritaria",
      "Accesso API (su richiesta)",
    ],
  },
];

export const PLAN_FEATURES: PlanFeature[] = [
  { key: "passwords",              label: "Password",                minPlan: "free",      category: "password" },
  { key: "credential_categories",  label: "Categorie credenziali",   minPlan: "free",      category: "password" },
  { key: "password_shares",        label: "Condivisione password",   minPlan: "free",      category: "password" },
  { key: "localdrop_upload",       label: "Caricamento documenti",   minPlan: "free",      category: "localdrop" },
  { key: "localdrop_text",         label: "Testo rapido",            minPlan: "free",      category: "localdrop" },
  { key: "localdrop_folders",      label: "Creazione cartelle",      minPlan: "free",      category: "localdrop" },
  { key: "localdrop_doc_categories", label: "Categorie documenti",   minPlan: "essential", category: "localdrop" },
  { key: "localdrop_archive_load", label: "Load Zip / Rar",          minPlan: "essential", category: "localdrop" },
  { key: "file_shares",            label: "Condivisione file",       minPlan: "essential", category: "localdrop" },
  { key: "localdrop_folder_compress", label: "Compressione cartelle", minPlan: "pro",      category: "localdrop" },
  { key: "api_access",             label: "Accesso API",             minPlan: "essential", category: "licensing" },
  { key: "priority_support",       label: "Assistenza prioritaria",  minPlan: "pro",       category: "general" },
];

export function getPlan(code: PlanCode): Plan {
  return PLANS.find((p) => p.code === code) ?? PLANS[0];
}

/** Etichetta targhetta per una feature (ESSENTIAL/PRO) o null se già nel Free. */
export function featureBadge(key: string): "ESSENTIAL" | "PRO" | null {
  const f = PLAN_FEATURES.find((x) => x.key === key);
  if (!f || f.minPlan === "free") return null;
  return f.minPlan.toUpperCase() as "ESSENTIAL" | "PRO";
}

/** Formatta un prezzo €: intero senza decimali, altrimenti due decimali. */
export function fmtEuro(v: number): string {
  return Number.isInteger(v) ? `${v}€` : `${v.toFixed(2)}€`;
}
