/**
 * SEO per-pagina lato SPA (task SEO WebPlatform).
 *
 * Non usiamo react-helmet per non aggiungere dipendenze: l'hook `useSeo` aggiorna
 * imperativamente <title>, la meta description, il canonical e i tag Open Graph /
 * Twitter Card sul mount della pagina. I default statici restano in index.html
 * (utili per i crawler che non eseguono JS); qui li sovrascriviamo per pagina.
 */
import { useEffect } from "react";

/** Origine pubblica del sito, per canonical e og:url assoluti. */
export const SITE_URL = "https://securelocalshare.netlify.app";

/** Immagine social di default (TODO: sostituire con una 1200x630 dedicata). */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/icon-512.png`;

export interface SeoOptions {
  title: string;
  description: string;
  /** Path assoluto della pagina, es. "/pricing". Default: "/". */
  path?: string;
  /** URL immagine social (assoluto). Default: DEFAULT_OG_IMAGE. */
  image?: string;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Applica title + meta description + canonical + OG/Twitter per la pagina corrente.
 * Chiamalo una volta nel corpo del componente pagina.
 */
export function useSeo({ title, description, path = "/", image = DEFAULT_OG_IMAGE }: SeoOptions) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;

    document.title = title;
    setMeta("name", "description", description);
    setLink("canonical", url);

    // Open Graph
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "SecureLocalShare");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", image);

    // Twitter Card
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
  }, [title, description, path, image]);
}
