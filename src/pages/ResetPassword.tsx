import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Check, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PASSWORD_CHECKS, isPasswordValid } from "@/utils/password";

export function ResetPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // Supabase parses the recovery token from the URL hash (detectSessionInUrl)
  // and establishes a short-lived recovery session. We only need to verify it exists.
  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        if (active) {
          setValidLink(true);
          setReady(true);
        }
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setValidLink(Boolean(data.session));
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const pwOk = isPasswordValid(password);
  const match = confirm.length > 0 && password === confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pwOk) return toast.error("La password non rispetta tutti i requisiti.");
    if (!match) return toast.error("Le due password non coincidono.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password aggiornata. Effettua l'accesso.");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aggiornamento non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  if (ready && !validLink) {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title="Link non valido"
        subtitle="Il link di reset è scaduto o è già stato usato. Richiedine uno nuovo."
        footer={
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            Richiedi un nuovo link
          </Link>
        }
      >
        <Button onClick={() => navigate("/login")} variant="outline" className="w-full">
          Torna al login
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={ShieldCheck}
      title="Imposta una nuova password"
      subtitle="Scegli una password robusta: la userai per accedere alla piattaforma."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Nuova password</Label>
          <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="••••••••••" />
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {PASSWORD_CHECKS.map((c) => {
              const ok = c.test(password);
              return (
                <li key={c.label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-success" : "text-muted-foreground"}`}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                  {c.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Conferma password</Label>
          <PasswordInput required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="••••••••••" />
          {confirm.length > 0 && !match && <p className="mt-1 text-xs text-destructive">Le password non coincidono.</p>}
        </div>

        <Button type="submit" disabled={busy || !ready} className="bg-brand-gradient shadow-glow hover:opacity-90">
          {busy ? "Aggiornamento…" : "Aggiorna password →"}
        </Button>
      </form>
    </AuthLayout>
  );
}
