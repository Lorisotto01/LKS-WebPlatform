/**
 * publish-release.mjs — pubblica una nuova versione di SecureLocalShare.
 *
 * Fa le DUE cose che la web app NON può fare (RLS le nega agli utenti):
 *   1. carica l'eseguibile nel bucket privato `releases`
 *   2. inserisce/aggiorna la riga in `public.releases`
 *
 * Usa la chiave SERVICE_ROLE: va eseguito SOLO in locale, MAI nel browser.
 *
 * Uso:
 *   node scripts/publish-release.mjs ./build/SecureLocalShareSetup-1.2.0.exe v1.2.0 "Note di rilascio"
 *
 * Richiede (in un .env NON committato o variabili d'ambiente):
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...      // chiave segreta, non la publishable!
 *
 * Dipendenze:  npm i @supabase/supabase-js
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const [, , filePath, version, ...notesParts] = process.argv;
const notes = notesParts.join(" ") || null;

if (!filePath || !version) {
  console.error("Uso: node scripts/publish-release.mjs <file.exe> <version> [note...]");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Mancano SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

// Il service_role bypassa la RLS: può scrivere su storage e tabelle.
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const objectPath = basename(filePath); // = download_url salvato nella tabella
const BUCKET = "releases";

async function main() {
  const bytes = await readFile(filePath);

  // 1) Upload nel bucket privato (upsert: sovrascrive se ricarichi la stessa versione).
  console.log(`↑ Upload ${objectPath} (${(bytes.length / 1e6).toFixed(1)} MB) → bucket "${BUCKET}"`);
  const up = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: "application/vnd.microsoft.portable-executable",
    upsert: true,
  });
  if (up.error) throw up.error;

  // 2) Disattiva le versioni precedenti, così questa diventa "l'ultima".
  await supabase.from("releases").update({ is_active: false }).neq("version", version);

  // 3) Inserisci/aggiorna la riga della release.
  const row = {
    version,
    notes,
    download_url: objectPath,
    is_active: true,
    min_version: version,
    release_date: new Date().toISOString(),
  };
  const ins = await supabase.from("releases").upsert(row, { onConflict: "version" });
  if (ins.error) throw ins.error;

  console.log(`✓ Release ${version} pubblicata e impostata come attiva.`);
}

main().catch((e) => {
  console.error("✗ Errore:", e.message ?? e);
  process.exit(1);
});
