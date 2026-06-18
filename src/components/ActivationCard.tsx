import { useEffect, useState } from "react";
import { KeyRound, Copy, Check, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ensureActivation } from "@/lib/activations";
import type { Activation } from "@/types/database.types";

const STATUS = {
  pending: { label: "In attesa di attivazione", cls: "bg-warning/15 text-warning", icon: AlertTriangle },
  active: { label: "Dispositivo collegato", cls: "bg-success/15 text-success", icon: CheckCircle2 },
  suspended: { label: "Sospeso", cls: "bg-destructive/15 text-destructive", icon: AlertTriangle },
} as const;

/** Mostra il token di attivazione da inserire al primo avvio della DesktopApp. */
export function ActivationCard() {
  const { user } = useAuth();
  const [act, setAct] = useState<Activation | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    ensureActivation(user.email).then((a) => {
      setAct(a);
      setLoading(false);
    });
  }, [user?.email]);

  const copy = async () => {
    if (!act) return;
    await navigator.clipboard.writeText(act.activation_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading || !act) return null;

  const s = STATUS[act.status];

  return (
    <section className="mt-10 rounded-xl border bg-card/60 p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="h-5 w-5 text-primary" /> Attivazione dispositivo
        </h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
          <s.icon className="h-3.5 w-3.5" /> {s.label}
        </span>
      </div>

      {act.status === "active" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Questo account è già collegato a un dispositivo. Per spostarlo su un altro PC, contatta l'amministratore
          per il re-binding.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Al <span className="text-foreground">primo avvio</span> della DesktopApp, incolla questo token di
            attivazione per collegare il dispositivo al tuo account.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{act.activation_token}</code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiato" : "Copia"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
