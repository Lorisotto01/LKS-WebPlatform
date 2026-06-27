import { supabase } from "./supabase";
import type { AuthorProfile } from "@/types/database.types";

const ASSETS_BUCKET = "assets";

/** Legge il profilo autore (riga singleton id=1) mostrato in /chi-sono. */
export async function getAuthorProfile(): Promise<AuthorProfile | null> {
  const { data } = await supabase
    .from("author_profile")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return data ?? null;
}

/** Aggiorna il profilo autore (solo admin via RLS). */
export async function updateAuthorProfile(
  patch: Partial<Omit<AuthorProfile, "id" | "updated_at">>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("author_profile").update(patch).eq("id", 1);
  return { error: error?.message ?? null };
}

/**
 * Carica la foto profilo nel bucket pubblico `assets` e ne ritorna l'URL pubblico.
 * Solo l'admin può scrivere (RLS). Il path è fisso così da sovrascrivere la precedente.
 */
export async function uploadProfilePhoto(file: File): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `profile/photo.${ext}`;
  const up = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (up.error) return { url: null, error: up.error.message };
  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
  // Cache-busting: l'URL pubblico è stabile, aggiungo un timestamp per forzare il refresh.
  return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
}
