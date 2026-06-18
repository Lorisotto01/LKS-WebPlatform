import { useEffect, useRef, useState, type FormEvent } from "react";
import { UploadCloud, Trash2, CheckCircle2, CircleSlash, FileUp, ShieldCheck, ShieldAlert, FileSignature } from "lucide-react";
import { supabase, RELEASES_BUCKET } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Release } from "@/types/database.types";

// SHA-256 del file calcolato interamente nel browser (Web Crypto), restituito
// come hex lowercase di 64 caratteri — lo stesso formato verificato dal desktop.
async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function AdminReleases() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const sigFileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sha256, setSha256] = useState("");
  const [hashing, setHashing] = useState(false);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [minVersion, setMinVersion] = useState("");
  const [signature, setSignature] = useState("");
  const [signKeyId, setSignKeyId] = useState("");
  const [setAsLatest, setSetAsLatest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("releases")
      .select("*")
      .order("release_date", { ascending: false });
    if (error) toast.error("Caricamento release non riuscito.");
    setReleases(data ?? []);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  const reset = () => {
    setFile(null);
    setSha256("");
    setVersion("");
    setNotes("");
    setMinVersion("");
    setSignature("");
    setSignKeyId("");
    setSetAsLatest(true);
    if (fileRef.current) fileRef.current.value = "";
    if (sigFileRef.current) sigFileRef.current.value = "";
  };

  // Alla selezione del file: calcola subito lo SHA-256 nel browser.
  const onPickFile = async (f: File | null) => {
    setFile(f);
    setSha256("");
    if (!f) return;
    setHashing(true);
    try {
      setSha256(await sha256Hex(f));
    } catch {
      toast.error("Calcolo SHA-256 non riuscito.");
    } finally {
      setHashing(false);
    }
  };

  // Carica la firma da un file .sig (testo base64) nel campo signature.
  const onPickSig = async (f: File | null) => {
    if (!f) return;
    try {
      setSignature((await f.text()).trim());
    } catch {
      toast.error("Lettura del file .sig non riuscita.");
    }
  };

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Seleziona l'eseguibile .exe da caricare.");
    if (!version.trim()) return toast.error("Indica la versione (es. v1.2.0).");
    if (hashing || !sha256) return toast.error("Attendi il calcolo dello SHA-256 del file.");
    // C1 — DoD: una release senza hash+firma non può essere attivata.
    if (setAsLatest && (!sha256 || !signature.trim())) {
      return toast.error("Per attivare la release servono SHA-256 (auto) e firma Ed25519.");
    }
    setBusy(true);
    try {
      const objectPath = file.name; // = download_url salvato nella tabella

      // 1) Upload nel bucket privato. upsert: sovrascrive se ricarichi la stessa build.
      const up = await supabase.storage
        .from(RELEASES_BUCKET)
        .upload(objectPath, file, { upsert: true, contentType: "application/octet-stream" });
      if (up.error) throw up.error;

      // 2) Se richiesto, disattiva tutte le altre versioni: questa diventa "l'ultima".
      if (setAsLatest) {
        await supabase.from("releases").update({ is_active: false }).neq("version", version.trim());
      }

      // 3) Inserisci/aggiorna la riga della release (upsert su version).
      const ins = await supabase.from("releases").upsert(
        {
          version: version.trim(),
          notes: notes.trim() || null,
          download_url: objectPath,
          is_active: setAsLatest,
          min_version: minVersion.trim() || version.trim(),
          release_date: new Date().toISOString(),
          sha256,
          signature: signature.trim() || null,
          sign_key_id: signKeyId.trim() || null,
        },
        { onConflict: "version" }
      );
      if (ins.error) throw ins.error;

      toast.success(`Release ${version.trim()} pubblicata.`);
      reset();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pubblicazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: Release) => {
    // C1 — DoD: non si può attivare una release priva di hash+firma.
    if (!r.is_active && (!r.sha256 || !r.signature)) {
      return toast.error("Release non firmata: aggiungi SHA-256 e firma prima di attivarla.");
    }
    const { error } = await supabase
      .from("releases")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (r: Release) => {
    if (!confirm(`Eliminare la release ${r.version} e il relativo file?`)) return;
    // Rimuove prima l'oggetto dallo storage, poi la riga.
    await supabase.storage.from(RELEASES_BUCKET).remove([r.download_url]);
    const { error } = await supabase.from("releases").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(`Release ${r.version} eliminata.`);
    load();
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight">Pubblica release</h1>
        <p className="mt-1.5 text-muted-foreground">
          Carica l'eseguibile e crea la versione. Tutto dal browser: i permessi sono concessi solo al tuo
          account admin.
        </p>

        {/* ---- Publish form ---- */}
        <form onSubmit={publish} className="mt-8 rounded-xl border bg-card/60 p-6 shadow-card">
          <Label>Eseguibile (.exe)</Label>
          <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-background/40 px-4 py-4 transition-colors hover:border-primary/50">
            <FileUp className="h-5 w-5 text-primary" />
            <span className="min-w-0 flex-1 text-sm">
              {file ? (
                <span className="font-medium">
                  {file.name}{" "}
                  <span className="text-muted-foreground">({(file.size / 1e6).toFixed(1)} MB)</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Clicca per selezionare il file .exe…</span>
              )}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".exe,application/octet-stream"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {/* SHA-256 calcolato nel browser */}
          {file && (
            <div className="mt-2 flex items-start gap-2 text-xs">
              {hashing ? (
                <span className="text-muted-foreground">Calcolo SHA-256 in corso…</span>
              ) : sha256 ? (
                <>
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  <span className="min-w-0">
                    <span className="font-semibold text-success">SHA-256</span>{" "}
                    <span className="break-all font-mono text-muted-foreground">{sha256}</span>
                  </span>
                </>
              ) : null}
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Versione</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.2.0" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Versione minima (auto-update)</Label>
              <Input value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="default = versione" />
            </div>
          </div>

          {/* ---- Firma Ed25519 (prodotta offline dal Tool-CLI) ---- */}
          <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <FileSignature className="h-4 w-4 text-primary" /> Firma Ed25519 (detached)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Genera la firma offline col Tool-CLI (<code>sign-release</code>) sul file caricato e incolla qui la
              firma base64, oppure carica il file <code>.sig</code>. La chiave privata non transita mai dal browser.
            </p>

            <div className="mt-3 flex flex-col gap-1.5">
              <Label>Firma (base64)</Label>
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                rows={3}
                placeholder="MEUCIQ… (firma Ed25519 detached, base64)"
                className="flex w-full break-all rounded-md border border-input bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <label className="mt-1 inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs text-primary hover:underline">
                <FileUp className="h-3.5 w-3.5" /> Carica file .sig
                <input
                  ref={sigFileRef}
                  type="file"
                  accept=".sig,.txt,text/plain"
                  className="hidden"
                  onChange={(e) => onPickSig(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <Label>ID chiave di firma (sign_key_id)</Label>
              <Input value={signKeyId} onChange={(e) => setSignKeyId(e.target.value)} placeholder="es. lks-ed25519-2026-01" />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <Label>Release notes (una per riga)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={"Prima release pubblica\nSistema di crittografia AES-256-GCM\nWeb App multi-utente"}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={setAsLatest}
              onChange={(e) => setSetAsLatest(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Imposta come ultima versione (disattiva le precedenti)
          </label>
          {setAsLatest && (!sha256 || !signature.trim()) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" /> Per attivare la release servono SHA-256 e firma Ed25519.
            </p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Button type="submit" disabled={busy} className="bg-brand-gradient shadow-glow hover:opacity-90">
              <UploadCloud className="h-5 w-5" />
              {busy ? "Pubblicazione…" : "Carica e pubblica"}
            </Button>
            {busy && <span className="text-xs text-muted-foreground">Upload in corso, non chiudere la pagina…</span>}
          </div>
        </form>

        {/* ---- Existing releases ---- */}
        <h2 className="mb-3 mt-10 text-lg font-semibold">Release pubblicate</h2>
        {releases.length === 0 ? (
          <p className="rounded-lg border bg-card/40 p-5 text-sm text-muted-foreground">
            Nessuna release ancora pubblicata.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card/40">
            {releases.map((r) => {
              const signed = Boolean(r.sha256 && r.signature);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="font-mono text-sm font-semibold">{r.version}</span>
                  {r.is_active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                      <CheckCircle2 className="h-3 w-3" /> attiva
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      <CircleSlash className="h-3 w-3" /> nascosta
                    </span>
                  )}
                  {signed ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success"
                      title={`SHA-256: ${r.sha256}`}
                    >
                      <ShieldCheck className="h-3 w-3" /> firmata
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning"
                      title="Manca SHA-256 e/o firma"
                    >
                      <ShieldAlert className="h-3 w-3" /> non firmata
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {r.download_url} · {new Date(r.release_date).toLocaleDateString("it-IT")}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => toggleActive(r)} disabled={!r.is_active && !signed}>
                    {r.is_active ? "Nascondi" : "Attiva"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => remove(r)} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Elimina
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
