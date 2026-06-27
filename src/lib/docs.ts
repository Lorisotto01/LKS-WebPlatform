import { supabase } from "./supabase";
import type { DocSettings, DocBlockRow } from "@/types/database.types";

const ASSETS_BUCKET = "assets";
const DOCS_PREFIX = "docs";

export type DocBlockType =
  | "title" | "paragraph" | "image" | "note" | "warning" | "list" | "table" | "code" | "divider";

export interface DocBlock {
  id: string;
  position: number;
  type: DocBlockType;
  content: Record<string, unknown>;
  visible: boolean;
}

export const BLOCK_LABELS: Record<DocBlockType, string> = {
  title: "Titolo",
  paragraph: "Paragrafo",
  image: "Immagine",
  note: "Nota",
  warning: "Avviso",
  list: "Lista",
  table: "Tabella",
  code: "Codice",
  divider: "Divisore",
};

/** Contenuto iniziale per un nuovo blocco del tipo dato. */
export function defaultContent(type: DocBlockType): Record<string, unknown> {
  switch (type) {
    case "title": return { text: "Nuovo titolo", icon: "BookOpen" };
    case "paragraph": return { text: "Nuovo paragrafo." };
    case "image": return { url: "", alt: "", caption: "" };
    case "note": return { text: "Nota informativa." };
    case "warning": return { text: "Avviso importante." };
    case "list": return { ordered: false, items: ["Primo elemento"] };
    case "table": return { header: true, rows: [["Colonna 1", "Colonna 2"], ["", ""]] };
    case "code": return { lang: "text", code: "" };
    case "divider": return {};
  }
}

function toBlock(r: DocBlockRow): DocBlock {
  return {
    id: r.id,
    position: r.position,
    type: r.type,
    content: (r.content && typeof r.content === "object" ? r.content : {}) as Record<string, unknown>,
    visible: r.visible,
  };
}

/* ----------------------------------------------------------------- settings */

export async function getDocSettings(): Promise<DocSettings | null> {
  const { data } = await supabase.from("doc_settings").select("*").eq("id", 1).maybeSingle();
  return data ?? null;
}

export async function updateDocSettings(patch: Partial<Omit<DocSettings, "id" | "updated_at">>): Promise<{ error: string | null }> {
  const { error } = await supabase.from("doc_settings").update(patch).eq("id", 1);
  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------- blocks */

/** Blocchi visibili, ordinati — per la pagina pubblica /docs. */
export async function getPublicDocBlocks(): Promise<DocBlock[]> {
  const { data } = await supabase
    .from("doc_blocks").select("*").eq("visible", true).order("position", { ascending: true });
  return (data ?? []).map(toBlock);
}

/** Tutti i blocchi (anche nascosti), ordinati — per l'admin. */
export async function getAllDocBlocks(): Promise<DocBlock[]> {
  const { data } = await supabase
    .from("doc_blocks").select("*").order("position", { ascending: true });
  return (data ?? []).map(toBlock);
}

export async function createDocBlock(type: DocBlockType, position: number): Promise<{ block: DocBlock | null; error: string | null }> {
  const { data, error } = await supabase
    .from("doc_blocks")
    .insert({ type, position, content: defaultContent(type) as never })
    .select().single();
  return { block: data ? toBlock(data) : null, error: error?.message ?? null };
}

export async function updateDocBlock(
  id: string,
  patch: { content?: Record<string, unknown>; visible?: boolean; type?: DocBlockType }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("doc_blocks").update(patch as never).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteDocBlock(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("doc_blocks").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/** Riassegna le posizioni 10,20,30… nell'ordine dell'array passato. */
export async function persistOrder(blocks: DocBlock[]): Promise<{ error: string | null }> {
  for (let i = 0; i < blocks.length; i++) {
    const pos = (i + 1) * 10;
    if (blocks[i].position !== pos) {
      const { error } = await supabase.from("doc_blocks").update({ position: pos }).eq("id", blocks[i].id);
      if (error) return { error: error.message };
    }
  }
  return { error: null };
}

/* -------------------------------------------------------------------- media */

export interface MediaItem { name: string; url: string }

export async function listDocsMedia(): Promise<MediaItem[]> {
  const { data } = await supabase.storage.from(ASSETS_BUCKET).list(DOCS_PREFIX, {
    sortBy: { column: "created_at", order: "desc" },
  });
  return (data ?? [])
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => ({
      name: f.name,
      url: supabase.storage.from(ASSETS_BUCKET).getPublicUrl(`${DOCS_PREFIX}/${f.name}`).data.publicUrl,
    }));
}

export async function uploadDocsMedia(file: File): Promise<{ url: string | null; error: string | null }> {
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${DOCS_PREFIX}/${Date.now()}_${safe}`;
  const up = await supabase.storage.from(ASSETS_BUCKET).upload(path, file, {
    upsert: false, contentType: file.type || "application/octet-stream",
  });
  if (up.error) return { url: null, error: up.error.message };
  return { url: supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path).data.publicUrl, error: null };
}

export async function deleteDocsMedia(name: string): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(ASSETS_BUCKET).remove([`${DOCS_PREFIX}/${name}`]);
  return { error: error?.message ?? null };
}
