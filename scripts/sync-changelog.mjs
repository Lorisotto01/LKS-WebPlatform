/**
 * sync-changelog.mjs — copia il CHANGELOG del progetto in public/ così che la
 * pagina /changelog possa caricarlo a runtime (fetch('/CHANGELOG.md')).
 * Eseguito automaticamente da `predev` e `prebuild` (vedi package.json).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [join(root, "..", "CHANGELOG.md"), join(root, "CHANGELOG.md")];
const src = candidates.find(existsSync);
const destDir = join(root, "public");
const dest = join(destDir, "CHANGELOG.md");

if (!src) {
  console.warn("[sync-changelog] CHANGELOG.md non trovato, salto.");
  process.exit(0);
}
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-changelog] ${src} → ${dest}`);
