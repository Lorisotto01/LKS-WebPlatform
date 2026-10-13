/**
 * Guardia dei deploy di prova (v5.1.0, task 869ffgurw): i deploy preview e i branch deploy di Netlify
 * sono pubblici per chiunque abbia il link. Questa Edge Function li apre solo a chi arriva dai paesi
 * ammessi E, se è configurata una lista, da uno degli IP ammessi.
 *
 * NON gira in produzione: il file viene copiato in netlify/edge-functions/ solo dalle build di
 * preview e branch (scripts/enable-preview-guard.mjs, vedi [context.*] in netlify.toml). Così il
 * sito pubblico non paga né latenza né invocazioni.
 *
 * Configurazione (Netlify → Site configuration → Environment variables, scope "Functions"):
 *   PREVIEW_ALLOWED_COUNTRIES  codici ISO separati da virgola, default "IT"
 *   PREVIEW_ALLOWED_IPS        IP esatti (IPv4 o IPv6) o reti IPv4 CIDR (es. 93.40.0.0/16), facoltativo
 */
import type { Config, Context } from "@netlify/edge-functions";

declare const Netlify: { env: { get(name: string): string | undefined } };

/** Lista da variabile d'ambiente: "IT, ch" → ["IT", "CH"] (i codici paese sono maiuscoli). */
export function parseList(raw: string | undefined, upper = false): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => (upper ? s.trim().toUpperCase() : s.trim().toLowerCase()))
    .filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x) || Number(x) > 255) return null;
    n = n * 256 + Number(x);
  }
  return n;
}

/** true se `ip` coincide con una voce della lista (IP esatto o rete IPv4 in notazione CIDR). */
export function ipAllowed(ip: string, allowed: string[]): boolean {
  const addr = ip.trim().toLowerCase();
  for (const entry of allowed) {
    if (entry === addr) return true;
    const [net, bitsRaw] = entry.split("/");
    if (bitsRaw === undefined) continue;
    const bits = Number(bitsRaw);
    const a = ipv4ToInt(addr);
    const n = ipv4ToInt(net);
    if (a === null || n === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((a & mask) >>> 0) === ((n & mask) >>> 0)) return true;
  }
  return false;
}

/** Decisione pura, separata dal runtime Netlify per poterla provare. */
export function isAllowed(country: string | undefined, ip: string, countries: string[], ips: string[]): boolean {
  if (!country || !countries.includes(country.toUpperCase())) return false;
  return ips.length === 0 || ipAllowed(ip, ips);
}

export default async (_req: Request, context: Context) => {
  const countries = parseList(Netlify.env.get("PREVIEW_ALLOWED_COUNTRIES") || "IT", true);
  const ips = parseList(Netlify.env.get("PREVIEW_ALLOWED_IPS"));
  if (isAllowed(context.geo?.country?.code, context.ip, countries, ips)) return context.next();

  return new Response("Accesso non consentito: questo è un deploy di prova riservato.\n", {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
};

export const config: Config = { path: "/*" };
