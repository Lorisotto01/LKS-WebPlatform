/**
 * Prerender delle pagine pubbliche (task Lighthouse Fase 3).
 *
 * Gira dopo `vite build` (client) e `vite build --ssr` (dist-ssr/entry-server.js):
 *  1. salva la shell SPA vuota in dist/app.html: è il fallback di Netlify per le route
 *     non prerenderizzate (login, dashboard, admin…), che restano renderizzate solo lato client;
 *  2. renderizza ogni route pubblica e scrive l'HTML completo (contenuto + <head> SEO della pagina)
 *     in dist/index.html per la home e in dist/<route>.html per le altre: Netlify serve
 *     /pricing da pricing.html senza redirect né slash finale;
 *  3. nelle pagine prerenderizzate il CSS (~8 kB gzip) è incorporato in <style>: niente richiesta
 *     che blocca il rendering, il primo paint arriva con il solo HTML. app.html tiene il <link>;
 *  4. gli script (entry + chunk della pagina) hanno fetchpriority="low": il contenuto è già nell'HTML,
 *     il JS serve solo a idratare e non deve contendere banda a documento e font.
 *
 * Nel browser main.tsx trova #root già pieno e idrata invece di renderizzare da zero:
 * il testo è visibile prima che il JS arrivi (FCP/LCP), e i crawler vedono i meta corretti.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

/** Route pubbliche indicizzabili (le stesse di sitemap.xml). */
const ROUTES = [
  "/",
  "/funzionalita",
  "/sicurezza",
  "/pricing",
  "/faq",
  "/recensioni",
  "/chi-sono",
  "/docs",
  "/changelog",
  "/privacy",
  "/terms",
];

/** Modulo della pagina per ogni route, per trovarne il chunk nel manifest di Vite. */
const PAGE_FILES = {
  "/funzionalita": "Funzionalita",
  "/sicurezza": "Sicurezza",
  "/pricing": "Pricing",
  "/faq": "Faq",
  "/recensioni": "Recensioni",
  "/chi-sono": "ChiSono",
  "/docs": "Docs",
  "/changelog": "Changelog",
  "/privacy": "Privacy",
  "/terms": "Terms",
};

const { app, renderToPipeableStream, ssrSeo, SITE_URL } = await import(
  pathToFileURL(path.join(root, "dist-ssr", "entry-server.js")).href
);

/**
 * Renderizza una route in stringa. onAllReady aspetta anche le pagine caricate con React.lazy,
 * così l'HTML contiene la pagina vera e non il fallback di <Suspense>. useSeo() della pagina
 * lascia i suoi valori in ssrSeo.current.
 */
function render(url) {
  ssrSeo.current = null;
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({
      write(chunk, _enc, cb) {
        html += chunk.toString();
        cb();
      },
    });
    sink.on("finish", () => resolve({ html, seo: ssrSeo.current }));
    const stream = renderToPipeableStream(app(url), {
      onAllReady: () => stream.pipe(sink),
      onShellError: reject,
      onError: reject,
    });
  });
}
const template = readFileSync(path.join(dist, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(dist, ".vite", "manifest.json"), "utf8"));

writeFileSync(path.join(dist, "app.html"), template);

/** Sostituisce il <link rel="stylesheet"> del bundle con il CSS incorporato. */
function inlineCss(html) {
  const re = /<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)">/;
  const m = html.match(re);
  if (!m) throw new Error("Foglio di stile del bundle non trovato nel template");
  const css = readFileSync(path.join(dist, m[1]), "utf8");
  return html.replace(re, () => `<style>${css}</style>`);
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sostituisce il valore di un attributo nel tag che corrisponde a `selector` (es. name="description"). */
function setAttr(html, tag, selector, attr, value) {
  const re = new RegExp(`(<${tag}\\s[^>]*${selector}[^>]*\\s${attr}=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`Tag non trovato nel template: <${tag} ${selector}>`);
  return html.replace(re, `$1${esc(value)}$2`);
}

function applySeo(html, seo, siteUrl) {
  const url = `${siteUrl}${seo.path}`;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.title)}</title>`);
  html = setAttr(html, "meta", 'name="description"', "content", seo.description);
  html = setAttr(html, "link", 'rel="canonical"', "href", url);
  html = setAttr(html, "meta", 'property="og:title"', "content", seo.title);
  html = setAttr(html, "meta", 'property="og:description"', "content", seo.description);
  html = setAttr(html, "meta", 'property="og:url"', "content", url);
  html = setAttr(html, "meta", 'property="og:image"', "content", seo.image);
  html = setAttr(html, "meta", 'name="twitter:title"', "content", seo.title);
  html = setAttr(html, "meta", 'name="twitter:description"', "content", seo.description);
  html = setAttr(html, "meta", 'name="twitter:image"', "content", seo.image);
  return html;
}

/** File JS della pagina (chunk lazy) e dei suoi import statici, da precaricare per idratare prima. */
function pageChunks(route) {
  const pageName = route === "/" ? null : PAGE_FILES[route];
  if (!pageName) return [];
  const files = new Set();
  const visit = (key) => {
    const entry = manifest[key];
    if (!entry || files.has(entry.file)) return;
    files.add(entry.file);
    (entry.imports ?? []).forEach(visit);
  };
  visit(`src/pages/${pageName}.tsx`);
  return [...files];
}

const entryFile = manifest["index.html"].file;

for (const route of ROUTES) {
  const { html: appHtml, seo } = await render(route);
  if (!seo) throw new Error(`La pagina ${route} non chiama useSeo(): il canonical resterebbe quello della home`);
  if (seo.path !== route) throw new Error(`useSeo() di ${route} dichiara path "${seo.path}"`);

  let html = inlineCss(applySeo(template, seo, SITE_URL));
  const preloads = pageChunks(route)
    .filter((f) => f !== entryFile)
    .map((f) => `<link rel="modulepreload" fetchpriority="low" crossorigin href="/${f}">`)
    .join("\n    ");
  if (preloads) html = html.replace("</head>", `    ${preloads}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
  html = html.replace('<script type="module" crossorigin', '<script type="module" fetchpriority="low" crossorigin');

  const out = route === "/" ? "index.html" : `${route.slice(1)}.html`;
  writeFileSync(path.join(dist, out), html);
  console.log(`[prerender] ${route.padEnd(14)} → dist/${out} (${(html.length / 1024).toFixed(1)} kB)`);
}
