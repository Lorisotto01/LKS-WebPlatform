import { useEffect, useState } from "react";
import { KeyRound, Copy, Check, CheckCircle2, AlertTriangle, MonitorSmartphone, Clock, ShieldOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  ensureActivation, getLicenseState, revokeActivation, middleTruncate, type LicenseState,
} from "@/lib/activations";
import { useToast } from "@/components/ui/toast";
import type { Activation } from "@/types/database.types";

const STATUS = {
  pending: { label: "In attesa di attivazione", cls: "bg-warning/15 text-warning", icon: AlertTriangle },
  active: { label: "Licenza attiva", cls: "bg-success/15 text-success", icon: CheckCircle2 },
  suspended: { label: "Sospeso", cls: "bg-destructive/15 text-destructive", icon: AlertTriangle },
} as const;

/**
 * All'accesso verifica lo stato della licenza su Supabase.
 * - Licenza attiva  -> nasconde il token e mostra i device collegati (con revoca).
 * - Licenza pending -> mostra il token di attivazione da inserire nella DesktopApp.
 */
export function ActivationCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<LicenseState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refresh = async (email: string) => {
    const ls = await getLicenseState(email);
    setState(ls);
    if (!ls.isActive) {
      const act = ls.pending ?? (await ensureActivation(email));
      setToken(act?.activation_token ?? null);
    } else {
      setToken(null);
    }
  };

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email;
    refresh(email).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const revoke = async (device: Activation) => {
    if (!user?.email) return;
    if (!confirm("Revocare la licenza di questo dispositivo? Verrà scollegato e il token di attivazione rigenerato: il vecchio non sarà più valido.")) return;
    setRevokingId(device.id);
    const { ok, error } = await revokeActivation(device.id);
    setRevokingId(null);
    if (!ok) return toast.error(error ?? "Revoca non riuscita.");
    toast.success("Licenza revocata. Token rigenerato.");
    await refresh(user.email);
  };

  if (loading || !state) return null;
  const headStatus = state.isActive ? STATUS.active : STATUS.pending;

  return (
    <section className="mt-10 rounded-xl border bg-card/60 p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="h-5 w-5 text-primary" /> Attivazione dispositivo
        </h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${headStatus.cls}`}>
          <headStatus.icon className="h-3.5 w-3.5" /> {headStatus.label}
        </span>
      </div>

      {state.isActive ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            La licenza è attiva. Per sicurezza il token non viene mostrato. Di seguito i dispositivi collegati: puoi
            revocarne la licenza in qualsiasi momento.
          </p>
          <ul className="mt-4 space-y-2.5">
            {state.devices.map((d) => (
              <DeviceRow key={d.id} device={d} onRevoke={() => revoke(d)} revoking={revokingId === d.id} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Al <span className="text-foreground">primo avvio</span> della DesktopApp, incolla questo token di
            attivazione per collegare il dispositivo al tuo account.
          </p>
          {token ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-sm">{token}</code>
              <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiato" : "Copia"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Token non disponibile. Scarica una versione dalla card a sinistra per generarne uno.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function DeviceRow({ device, onRevoke, revoking }: { device: Activation; onRevoke: () => void; revoking: boolean }) {
  const s = STATUS[device.status];
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/50 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <MonitorSmartphone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm" title={device.hwid ?? ""}>{middleTruncate(device.hwid ?? "")}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {device.activated_at && (
            <><Clock className="h-3 w-3" />Attivato il {new Date(device.activated_at).toLocaleDateString("it-IT")}</>
          )}
          {device.app_version && <span>· v{device.app_version.replace(/^v/, "")}</span>}
        </p>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
        <s.icon className="h-3 w-3" /> {device.status === "active" ? "Collegato" : s.label}
      </span>
      <button
        type="button"
        onClick={onRevoke}
        disabled={revoking}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
      >
        <ShieldOff className="h-3.5 w-3.5" /> {revoking ? "Revoca…" : "Revoca licenza"}
      </button>
    </li>
  );
}
