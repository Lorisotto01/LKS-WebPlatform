import { supabase } from "./supabase";
import type { Review } from "@/types/database.types";

/** Tutte le recensioni, più recenti prima. Lettura pubblica (RLS). */
export async function listReviews(): Promise<Review[]> {
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export interface NewReview {
  email: string;
  authorName: string;
  version: string;
  titolo: string;
  rating: number;
  descrizione?: string;
}

/** Inserisce una recensione a nome dell'utente loggato (RLS: email = current_email). */
export async function submitReview(r: NewReview): Promise<{ error: string | null }> {
  const { error } = await supabase.from("reviews").insert({
    email: r.email,
    author_name: r.authorName || null,
    version: r.version.trim(),
    titolo: r.titolo.trim(),
    rating: Math.max(1, Math.min(5, Math.round(r.rating))),
    descrizione: r.descrizione?.trim() || null,
  });
  return { error: error?.message ?? null };
}

/** Raggruppa le recensioni per versione, ordinando le versioni in modo decrescente. */
export function groupByVersion(reviews: Review[]): { version: string; items: Review[]; avg: number }[] {
  const map = new Map<string, Review[]>();
  for (const r of reviews) {
    const key = r.version || "—";
    (map.get(key) ?? map.set(key, []).get(key)!).push(r);
  }
  return Array.from(map.entries())
    .map(([version, items]) => ({
      version,
      items,
      avg: items.reduce((s, x) => s + x.rating, 0) / items.length,
    }))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}
