// device-unlock (v4.8.0)
// Chiamata dalla DesktopApp (con anon/publishable key) all'avvio quando il dispositivo è
// permanentemente bloccato. Autentica il device tramite (hwid + activation_token [+ email]) e,
// se l'admin ha già caricato un unlock.lks per quell'HWID, restituisce un link firmato temporaneo
// da cui la DesktopApp scarica e verifica il file in automatico.
//
// Le Edge Functions NON generano mai il file di sblocco: lo produce l'autore col Tool-CLI e lo
// carica dalla tab Contabilità. Questa function si limita a recapitarlo al dispositivo legittimo.
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/orders.ts";

const SIGNED_TTL = 60 * 10; // 10 minuti: il device scarica subito dopo la richiesta.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { hwid, token, email } = await req.json();
    if (!hwid || !token) return json({ error: "missing_args" }, 400);

    const admin = adminClient();

    // 1) Autenticazione del dispositivo: activation_token attivo e legato a questo HWID.
    const { data: act } = await admin
      .from("activations")
      .select("email,hwid,status")
      .eq("activation_token", token)
      .maybeSingle();
    if (!act || act.hwid !== hwid || act.status !== "active" || (email && act.email !== email)) {
      return json({ error: "forbidden" }, 403);
    }

    // 2) Unlock pronto per questo HWID (il più recente). Include 'downloaded' per consentire
    //    un nuovo tentativo dopo un apply non riuscito.
    const { data: uf } = await admin
      .from("unlock_files")
      .select("id,storage_path,lock_type,status")
      .eq("hwid", hwid)
      .in("status", ["ready", "emailed", "downloaded"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!uf) return json({ available: false });

    // 3) Link firmato temporaneo al file nel bucket privato 'unlocks'.
    const { data: signed, error: sErr } = await admin.storage
      .from("unlocks")
      .createSignedUrl(uf.storage_path, SIGNED_TTL);
    if (sErr || !signed) return json({ error: "sign_failed", detail: sErr?.message }, 500);

    // 4) Segna 'downloaded' (best-effort: non blocca la consegna).
    await admin
      .from("unlock_files")
      .update({ status: "downloaded", downloaded_at: new Date().toISOString() })
      .eq("id", uf.id);

    return json({ available: true, url: signed.signedUrl, id: uf.id, lock_type: uf.lock_type });
  } catch (e) {
    return json({ error: "server_error", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
