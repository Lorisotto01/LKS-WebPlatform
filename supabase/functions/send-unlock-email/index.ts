// send-unlock-email (v4.5.0)
// Invocata dall'ADMIN dalla tab Contabilità dopo aver caricato l'unlock.lks.
// Genera un link firmato al file nello storage 'unlocks' e lo invia via email
// all'utente (Resend). Le Edge Functions NON generano mai il file di sblocco:
// lo produce l'autore col Tool-CLI e lo carica; questa function lo recapita.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/orders.ts";

const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 giorni

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // Solo admin.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: isAdmin } = await userClient.rpc("is_admin");
    if (isAdmin !== true) return json({ error: "forbidden" }, 403);

    const { unlockFileId } = await req.json();
    if (!unlockFileId) return json({ error: "missing_unlock_file" }, 400);

    const admin = adminClient();
    const { data: uf } = await admin.from("unlock_files").select("*").eq("id", unlockFileId).maybeSingle();
    if (!uf) return json({ error: "unlock_not_found" }, 404);

    // Link firmato al file.
    const { data: signed, error: sErr } = await admin.storage
      .from("unlocks").createSignedUrl(uf.storage_path, SIGNED_TTL);
    if (sErr || !signed) return json({ error: "sign_failed", detail: sErr?.message }, 500);
    const site = Deno.env.get("PUBLIC_SITE_URL") || "";

    // Invio email (Resend). Se manca la chiave, ritorna il link così l'admin lo inoltra a mano.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM") || "SecureLocalShare <onboarding@resend.dev>";
    let emailed = false;

    if (resendKey) {
      const lockLabel = uf.lock_type === "perm" ? "PERMANENT_LOCK" : "ENV_LOCK";
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2>Il tuo file di sblocco è pronto</h2>
          <p>Abbiamo generato il file <code>unlock.lks</code> per sbloccare il tuo dispositivo (${lockLabel}).</p>
          <p><a href="${signed.signedUrl}" style="background:#4F46E5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Scarica unlock.lks</a></p>
          <p>Oppure scaricalo dalla tua area personale: <a href="${site}/dashboard">${site}/dashboard</a></p>
          <p style="font-size:12px;color:#666">Carica il file nella DesktopApp per completare lo sblocco. Il link è valido 7 giorni.</p>
        </div>`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: uf.email, subject: "SecureLocalShare — File di sblocco", html }),
      });
      emailed = r.ok;
      if (!r.ok) console.log("[send-unlock-email] Resend error", await r.text());
    }

    await admin.from("unlock_files")
      .update({ status: emailed ? "emailed" : "ready", emailed_at: emailed ? new Date().toISOString() : null })
      .eq("id", unlockFileId);

    return json({ ok: true, emailed, signedUrl: signed.signedUrl });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
