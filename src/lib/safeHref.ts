/**
 * Link da contenuti modificabili dal pannello admin (guida, profilo autore): ammessi solo schemi
 * innocui (v5.0.0, rilievo L2). Un `javascript:` o `data:` salvato per errore, o da un account admin
 * compromesso, verrebbe altrimenti eseguito nel browser di ogni visitatore del sito.
 */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const href = raw.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) return href;
  return undefined;
}
