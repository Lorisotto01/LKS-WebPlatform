/**
 * publish-release.mjs — pubblica una nuova versione di SecureLocalShare via service_role.
 *
 * Fa le due cose che la web app non può fare lato browser senza essere admin:
 *   1. carica l'eseguibile nel bucket privato `releases`
 *   2. inserisce/aggiorna la riga in `public.releases` (con hash + firma, vedi C1)
 *
 * Usa la chiave SECRET/SERVICE_ROLE: eseguire SOLO in locale, MAI nel browser.
 *
 * Uso:
 *   node scripts/publish-release.mjs <file.exe> <version> [note...] [--sig <file.sig>] [--key-id <id>] [--inactive]
 *
 * Esempio:
 *   node scripts/publish-release.mjs ./SecureLocalShare.exe 4.2.1 "Release firmata" --key-id rel-ab12cd
 *
 * Le credenziali si leggono (in quest'ordine, senza sovrascrivere le env già impostate):
 *   1) variabili d'ambiente del processo
 *   2) .env.local  (consigliato: NON committato)
 *   3) .env        (qui di norma ci sono solo le chiavi pubbliche VITE_)
 * Variabili usate:
 *   SUPABASE_URL                  (fallback: VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY     (chiave SECRET sb_secret_... / service_role — mai la publishable!)
 *
 * sha256/signature/sign_key_id (C1):
 *   - sha256:      calcolato qui dal file (coincide con quello del Tool-CLI).
 *   - signature:   prodotta OFFLINE dal Tool-CLI menu [5] (sidecar `<exe>.sig`). Lo script lo legge
 *                  in automatico; oppure passalo con --sig <percorso>.
 *   - sign_key_id: stampato dal Tool-CLI menu [4]/[5]; passalo con --key-id <id> (o sidecar `<exe>.keyid`).
 *   Senza signature la release viene pubblicata come NON attiva (la DesktopApp non si fida di una
 *   release priva di firma): firmala e ripubblica, oppure usa il pannello /admin.
 *
 * Dipendenze:  npm i @supabase/supabase-js
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- mini caricatore .env (.env.local poi .env), non sovrascrive le env reali ---
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

// --- parsing argomenti ---
const argv = process.argv.slice(2);
let filePath, version, sigPath, keyId, setInactive = false;
const notesParts = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sig") sigPath = argv[++i];
  else if (a === "--key-id") keyId = argv[++i];
  else if (a === "--inactive") setInactive = true;
  else if (!filePath) filePath = a;
  else if (!version) version = a;
  else notesParts.push(a);
}
const notes = notesParts.join(" ") || null;

if (!filePath || !version) {
  console.error("Uso: node scripts/publish-release.mjs <file.exe> <version> [note...] [--sig <file.sig>] [--key-id <id>] [--inactive]");
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Mancano SUPABASE_URL (o VITE_SUPABASE_URL) e/o SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Mettile in .env.local oppure esportale nella shell. La service_role è la chiave SECRET, non la publishable.");
  process.exit(1);
}
if (/sb_publishable_|anon/i.test(serviceKey)) {
  console.error("✗ SUPABASE_SERVICE_ROLE_KEY sembra una chiave PUBBLICA (publishable/anon): serve la SECRET (sb_secret_.../service_role).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const objectPath = basename(filePath);
const BUCKET = "releases";

function readSidecar(p) {
  if (!p || !existsSync(p)) return null;
  // primo token non vuoto (il .sig contiene la sola firma; il .sha256 "hash  nome")
  return readFileSync(p, "utf8").trim().split(/\s+/)[0] || null;
}

async function main() {
  const bytes = await readFile(filePath);

  // sha256 (hex lowercase) calcolato dai byte esatti del file.
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // signature: dal sidecar <exe>.sig (o --sig). sign_key_id: da --key-id o <exe>.keyid.
  const signature = readSidecar(sigPath || `${filePath}.sig`);
  const signKeyId = keyId || readSidecar(`${filePath}.keyid`);

  const signed = Boolean(sha256 && signature);
  const isActive = signed && !setInactive;

  console.log(`↑ Upload ${objectPath} (${(bytes.length / 1e6).toFixed(1)} MB) → bucket "${BUCKET}"`);
  console.log(`  sha256       = ${sha256}`);
  console.log(`  signature    = ${signature ? signature.slice(0, 24) + "…" : "(assente)"}`);
  console.log(`  sign_key_id  = ${signKeyId ?? "(assente)"}`);
  if (!signed) {
    console.warn("⚠ Nessuna firma: la release sarà pubblicata come NON attiva (il desktop non si fida senza firma).");
    console.warn("  Firmala col Tool-CLI menu [5] (genera <exe>.sig) e ripubblica, oppure usa il pannello /admin.");
  }

  // 1) Upload nel bucket privato (upsert).
  const up = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: "application/vnd.microsoft.portable-executable",
    upsert: true,
  });
  if (up.error) throw up.error;

  // 2) Se questa diventa attiva, disattiva le altre.
  if (isActive) {
    await supabase.from("releases").update({ is_active: false }).neq("version", version);
  }

  // 3) Inserisci/aggiorna la riga (con i campi C1).
  const row = {
    version,
    notes,
    download_url: objectPath,
    is_active: isActive,
    min_version: version,
    release_date: new Date().toISOString(),
    sha256,
    signature: signature ?? null,
    sign_key_id: signKeyId ?? null,
  };
  const ins = await supabase.from("releases").upsert(row, { onConflict: "version" });
  if (ins.error) throw ins.error;

  console.log(`✓ Release ${version} pubblicata${isActive ? " e impostata come attiva." : " come NON attiva (firma mancante)."}`);
}

main().catch((e) => {
  console.error("✗ Errore:", e.message ?? e);
  process.exit(1);
});
