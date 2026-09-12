/**
 * wipe-storage.mjs — svuota i bucket di storage prima dell'azzeramento del database.
 *
 * PRE-STEP di `supabase/scripts/01_wipe_all.sql`, che NON puo' piu' occuparsene:
 * Supabase vieta la cancellazione diretta da `storage.objects` con il trigger
 * `storage.protect_delete()`
 *
 *     ERROR: Direct deletion from storage tables is not allowed.
 *            Use the Storage API instead.
 *
 * ed e' un bene: le vecchie `delete` SQL rimuovevano la riga di metadati ma
 * lasciavano il file vero nel backend, orfano e non piu' raggiungibile. Qui si
 * passa dalla Storage API, quindi i file vengono cancellati davvero.
 *
 * Il bucket `assets` NON viene mai toccato: ospita le immagini pubbliche del
 * sito, la foto profilo e i banner delle email, che non dipendono dai dati
 * applicativi. I bucket restano in piedi, vuoti: li riallinea 0006_storage.sql.
 *
 * DISTRUTTIVO. Chiede conferma esplicita a meno di --yes.
 *
 * Uso:
 *   node scripts/wipe-storage.mjs [--yes] [--dry-run] [--bucket <id>]...
 *
 *   --dry-run        elenca cosa cancellerebbe, senza cancellare
 *   --yes            salta la richiesta di conferma (per l'uso in npm script)
 *   --bucket <id>    limita a uno o piu' bucket (ripetibile); default: tutti
 *                    tranne `assets`
 *
 * Credenziali, come in publish-release.mjs (process.env, poi .env.local, poi .env):
 *   SUPABASE_URL                (fallback: VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY   (chiave SECRET sb_secret_… / service_role)
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Bucket mai toccato: contenuti pubblici indipendenti dai dati applicativi. */
const PRESERVED = "assets";
/** Quanti oggetti per chiamata di remove(): oltre si spezza in blocchi. */
const CHUNK = 100;

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
const only = [];
let assumeYes = false, dryRun = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--yes" || a === "-y") assumeYes = true;
  else if (a === "--dry-run") dryRun = true;
  else if (a === "--bucket") only.push(argv[++i]);
  else {
    console.error(`Argomento non riconosciuto: ${a}`);
    console.error("Uso: node scripts/wipe-storage.mjs [--yes] [--dry-run] [--bucket <id>]...");
    process.exit(1);
  }
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
if (only.includes(PRESERVED)) {
  console.error(`✗ Il bucket '${PRESERVED}' è protetto e non può essere svuotato da questo script.`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

/**
 * Elenca ricorsivamente i percorsi degli oggetti di un bucket.
 *
 * `list()` è paginata e non ricorsiva: una voce senza `id` è una cartella, e va
 * riaperta. Si pagina a 1000 per non perdere oggetti nei bucket grandi.
 */
async function listAll(bucket, prefix = "") {
  const paths = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) paths.push(full);
      else paths.push(...await listAll(bucket, full)); // cartella: scendi
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return paths;
}

const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
if (bErr) {
  console.error("✗ Impossibile elencare i bucket:", bErr.message);
  process.exit(1);
}

const targets = buckets
  .map((b) => b.id)
  .filter((id) => id !== PRESERVED)
  .filter((id) => only.length === 0 || only.includes(id));

if (targets.length === 0) {
  console.log(`Nessun bucket da svuotare ('${PRESERVED}' è sempre preservato).`);
  process.exit(0);
}

// --- inventario, prima di toccare qualsiasi cosa ---
const plan = [];
let total = 0;
for (const bucket of targets) {
  const paths = await listAll(bucket);
  plan.push({ bucket, paths });
  total += paths.length;
  console.log(`  ${bucket.padEnd(20)} ${paths.length} oggetti`);
}
console.log(`\n${total} oggetti in ${targets.length} bucket. Il bucket '${PRESERVED}' non viene toccato.`);

if (total === 0) {
  console.log("Niente da cancellare: lo storage è già pulito.");
  process.exit(0);
}
if (dryRun) {
  for (const { bucket, paths } of plan) for (const p of paths) console.log(`  [dry-run] ${bucket}/${p}`);
  process.exit(0);
}

if (!assumeYes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nCANCELLAZIONE IRREVERSIBILE di ${total} file. Scrivi CANCELLA per procedere: `);
  rl.close();
  if (answer.trim() !== "CANCELLA") {
    console.log("Annullato: nessun file cancellato.");
    process.exit(1);
  }
}

// --- cancellazione ---
let removed = 0, failed = 0;
for (const { bucket, paths } of plan) {
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      console.error(`  ✗ ${bucket}: ${error.message}`);
      failed += chunk.length;
    } else {
      removed += chunk.length;
    }
  }
  console.log(`  ✓ ${bucket} svuotato`);
}

console.log(`\nRimossi ${removed} file${failed ? `, ${failed} falliti` : ""}.`);
console.log("I bucket restano in piedi, vuoti: li riallinea la migration 0006_storage.sql.");
console.log("Ora puoi eseguire supabase/scripts/01_wipe_all.sql nel SQL Editor.");
process.exit(failed ? 1 : 0);
