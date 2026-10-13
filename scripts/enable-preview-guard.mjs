/**
 * Attiva la guardia dei deploy di prova (netlify/preview-guard/preview-guard.ts) copiandola tra le
 * Edge Functions. Lo lancia solo il comando di build dei contesti deploy-preview e branch-deploy in
 * netlify.toml: in produzione la cartella netlify/edge-functions/ non esiste e la guardia non gira.
 * Netlify impacchetta le Edge Functions dopo il comando di build, quindi la copia fatta qui viene presa.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "netlify", "edge-functions");
mkdirSync(dest, { recursive: true });
copyFileSync(path.join(root, "netlify", "preview-guard", "preview-guard.ts"), path.join(dest, "preview-guard.ts"));
console.log(`[preview-guard] attiva per il contesto ${process.env.CONTEXT ?? "(sconosciuto)"}`);
