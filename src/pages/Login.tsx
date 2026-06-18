import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Lock, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { email?: string } };
  const toast = useToast();
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [needVerify, setNeedVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNeedVerify(false);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.toLowerCase().includes("not confirmed")) {
          setNeedVerify(true);
          toast.error("Email non ancora verificata.");
          return;
        }
        throw error;
      }

      // Ensure a registrations row exists for this user (idempotent on unique email).
      // GDPR (C2): registrations contiene solo l'email; il nome resta in user_metadata.
      const { data: existing } = await supabase
        .from("registrations").select("email").eq("email", email).maybeSingle();
      if (!existing) {
        await supabase.from("registrations").insert({ email });
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Accesso non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!email) return toast.error("Inserisci la tua email per reinviare la verifica.");
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Email di verifica reinviata.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invio non riuscito.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      icon={Lock}
      title="Bentornato"
      subtitle="Accedi per scaricare le ultime versioni."
      width="sm"
      footer={
        <>
          Non hai un account?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Registrati
          </Link>
        </>
      }
    >
      {needVerify && (
        <div className="mb-5 flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Email non ancora verificata.</span> Controlla la mail di verifica o{" "}
            <button type="button" onClick={resend} disabled={resending} className="font-medium underline underline-offset-2 hover:opacity-80">
              {resending ? "invio..." : "reinvia verifica"}
            </button>
            .
          </p>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario.rossi@gmail.com" />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Password</Label>
            <Link to="/forgot-password" state={{ email }} className="text-xs text-primary hover:underline">
              Password dimenticata?
            </Link>
          </div>
          <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          Ricordami su questo dispositivo
        </label>

        <Button type="submit" disabled={busy} className="bg-brand-gradient shadow-glow hover:opacity-90">
          {busy ? "Accesso..." : "Accedi"}
        </Button>
      </form>
    </AuthLayout>
  );
}
