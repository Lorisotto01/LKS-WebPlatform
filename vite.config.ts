import { defineConfig, type Plugin } from "vite";
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

/**
 * Preload del font Inter (sottoinsieme latin) nell'HTML di build: il nome del file ha l'hash,
 * quindi non si può scrivere a mano in index.html. Così il font parte insieme al CSS invece
 * di aspettare che il CSS venga scaricato e interpretato.
 */
function preloadInterFont(): Plugin {
  return {
    name: "preload-inter-font",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const font = Object.keys(ctx.bundle ?? {}).find((f) => /inter-latin-wght-normal.*\.woff2$/.test(f));
        if (!font) return [];
        return [{
          tag: "link",
          attrs: { rel: "preload", href: `/${font}`, as: "font", type: "font/woff2", crossorigin: "" },
          injectTo: "head-prepend",
        }];
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadInterFont()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  define: { __APP_VERSION__: JSON.stringify(releaseVersion()) },
  // manifest: serve a scripts/prerender.mjs per precaricare il chunk della pagina prerenderizzata
  build: { outDir: "dist", emptyOutDir: true, manifest: true },
});
