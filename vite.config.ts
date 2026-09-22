import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "path";

/**
 * Versione mostrata nella landing, presa dal CHANGELOG invece che scritta a mano (v4.9.3).
 * Si guardano gli stessi due percorsi di `scripts/sync-changelog.mjs`: il CHANGELOG del
 * progetto sta un livello sopra, ma una copia locale resta valida se la WebPlatform viene
 * costruita da sola. Se non si trova nulla la build non si ferma: si ripiega sulla versione
 * del package.json, che e' comunque meglio di un numero fisso nel JSX.
 */
function releaseVersion(): string {
  for (const file of ["../CHANGELOG.md", "./CHANGELOG.md"]) {
    try {
      const m = readFileSync(path.resolve(__dirname, file), "utf8")
        .match(/Versione corrente:\s*\*\*([^*]+?)\*\*/i);
      if (m) return m[1].trim();
    } catch {
      // file assente: si prova il percorso successivo
    }
  }
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));
  console.warn(`[vite] CHANGELOG non trovato, versione dal package.json: ${pkg.version}`);
  return pkg.version;
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  define: { __APP_VERSION__: JSON.stringify(releaseVersion()) },
  build: { outDir: "dist", emptyOutDir: true },
});
