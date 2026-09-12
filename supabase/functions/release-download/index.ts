// release-download (v4.8.2)
// Unico punto di accesso ai binari delle release. Verifica chi sta chiedendo il download, firma il
// link con la service_role e registra l'audit.
//
// SICUREZZA (rilievo M6, task 869f13awr) — il bucket 'releases' concedeva SELECT al ruolo `anon`
// su TUTTI i suoi oggetti: la anon key è pubblica (nel bundle web e dentro il jar), quindi
// chiunque poteva elencare e scaricare direttamente qualsiasi oggetto del bucket, saltando sia il
// signed URL sia la registrazione in `downloads`. Adesso quel grant non esiste più: la firma la
// produce solo questa function, con la service_role, e solo dopo aver identificato il chiamante.
//
// Due identità ammesse:
//   * utente registrato  → JWT Supabase nell'header Authorization (dashboard web);
//   * dispositivo attivo → activation_token nel corpo (aggiornamento automatico della DesktopApp).
// Qualsiasi altra richiesta riceve 401.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/orders.ts";

/** Durata del link firmato: il client scarica subito dopo la richiesta. */
const SIGNED_TTL = 300; // 5 minuti

interface Body {
  /** Versione richiesta; se assente si usa la release attiva più recente. */
  version?: string;
  /** activation_token della DesktopApp (alternativa al JWT utente). */
  token?: string;
}

/** Email dell'utente autenticato con il JWT Supabase, oppure null. */
async function emailFromJwt(authHeader: string): Promise<string | null> {
  // La DesktopApp manda la anon key in questo header: getUser() non trova alcun utente e si
  // prosegue con l'activation_token. Nessun errore, solo un percorso diverso.
  if (!authHeader) return null;
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data } = await userClient.auth.getUser();
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const admin = adminClient();

    // 1) Identificazione del chiamante.
    let email = await emailFromJwt(req.headers.get("Authorization") ?? "");
    let via: "account" | "device" = "account";

    if (!email && body.token) {
      const { data: act } = await admin
        .from("activations")
        .select("email,status")
        .eq("activation_token", body.token)
        .maybeSingle();
      if (act && act.status === "active") {
        email = act.email;
        via = "device";
      }
    }
    if (!email) {
      return json({
        error: "unauthorized",
        message: "Accedi al tuo account per scaricare l'applicazione.",
      }, 401);
    }

    // 2) Release richiesta: deve essere pubblicata e attiva.
    const query = admin.from("releases").select("version,download_url").eq("is_active", true);
    const { data: rel } = body.version
      ? await query.eq("version", body.version).maybeSingle()
      : await query.order("release_date", { ascending: false }).limit(1).maybeSingle();
    if (!rel?.download_url) {
      return json({ error: "release_not_found", message: "Versione non disponibile." }, 404);
    }

    // 3) Link firmato con la service_role: è l'unico modo per raggiungere l'oggetto.
    const { data: signed, error: sErr } = await admin.storage
      .from("releases")
      .createSignedUrl(rel.download_url, SIGNED_TTL);
    if (sErr || !signed) {
      console.error("[release-download] firma URL non riuscita:", sErr?.message);
      return json({ error: "sign_failed", message: "Download non disponibile, riprova." }, 500);
    }

    // 4) Audit. Non blocca il download: un problema qui non deve impedire un aggiornamento.
    const { error: aErr } = await admin.from("downloads").insert({ email, version: rel.version });
    if (aErr) console.error("[release-download] audit non registrato:", aErr.message);
    await admin.from("registrations")
      .update({ last_download_at: new Date().toISOString() })
      .eq("email", email);

    console.log("[release-download]", rel.version, "per", email, "via", via);
    return json({ url: signed.signedUrl, version: rel.version, expiresInSeconds: SIGNED_TTL });
  } catch (e) {
    // Il dettaglio resta nei log della function, non torna al client (M10).
    console.error("[release-download] eccezione non gestita:", e);
    return json({ error: "unexpected", message: "Download non riuscito." }, 500);
  }
});
