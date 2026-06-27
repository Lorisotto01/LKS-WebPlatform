import { useState } from "react";
import { Star, Send, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitReview } from "@/lib/reviews";

/** Card della dashboard: l'utente lascia una recensione di una versione (1..5 stelle). */
export function ReviewForm({ versions, defaultVersion }: { versions: string[]; defaultVersion?: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [version, setVersion] = useState(defaultVersion ?? versions[0] ?? "");
  const [titolo, setTitolo] = useState("");
  const [rating, setRating] = useState(0);
  const [descrizione, setDescrizione] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!user?.email) return;
    if (!version.trim()) return toast.error("Indica la versione che vuoi recensire.");
    if (!titolo.trim()) return toast.error("Aggiungi un titolo alla recensione.");
    if (rating < 1) return toast.error("Seleziona una valutazione da 1 a 5 stelle.");
    setBusy(true);
    const name =
      (user.user_metadata?.name as string | undefined) ?? user.email.split("@")[0];
    const { error } = await submitReview({
      email: user.email,
      authorName: name,
      version: version.trim(),
      titolo,
      rating,
      descrizione,
    });
    setBusy(false);
    if (error) return toast.error(error);
    toast.success("Grazie per la tua recensione!");
    setDone(true);
  };

  if (done) {
    return (
      <section className="rounded-xl border border-success/30 bg-success/5 p-6 shadow-card">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Recensione inviata</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          La trovi nella vetrina pubblica delle recensioni, raggruppata per versione.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => { setDone(false); setTitolo(""); setRating(0); setDescrizione(""); }}>
          Scrivi un'altra recensione
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card/60 p-6 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Star className="h-5 w-5 text-warning" /> Lascia una recensione
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Racconta com'è andata con una versione: il tuo voto comparirà tra le recensioni pubbliche.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Versione</Label>
          {versions.length > 0 ? (
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {versions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ) : (
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="es. v4.3.4" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Titolo</Label>
          <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Una sintesi della tua esperienza" />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <Label>Valutazione</Label>
        <div className="flex items-center gap-3">
          <StarRating value={rating} onChange={setRating} size={28} />
          <span className="text-sm text-muted-foreground">{rating > 0 ? `${rating}/5` : "Seleziona"}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <Label>Descrizione (opzionale)</Label>
        <textarea
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          rows={3}
          placeholder="Cosa ti è piaciuto, cosa miglioreresti…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button onClick={submit} disabled={busy} className="mt-5 bg-brand-gradient shadow-glow hover:opacity-90">
        <Send className="h-4 w-4" /> {busy ? "Invio…" : "Invia recensione"}
      </Button>
    </section>
  );
}
