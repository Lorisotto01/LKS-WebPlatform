import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserPlus, Check, Circle } from "lucide-react";
import { supabase, siteUrl } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PASSWORD_CHECKS, isPasswordValid } from "@/utils/password";

export function Register() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const pwOk = isPasswordValid(form.password);
  const match = form.confirm.length > 0 && form.password === form.confirm;
  const canSubmit = Boolean(form.name && form.email && pwOk && match && accepted && !busy);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pwOk) return toast.error("La password non rispetta tutti i requisiti.");
    if (!match) return toast.error("Le due password non coincidono.");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { name: form.name },
          emailRedirectTo: `${siteUrl()}/verify-email`,
        },
      });
      if (error) throw error;

      // Create the registrations row now if a session already exists
      // (email confirmation disabled); otherwise it is created on first login.
      // GDPR (C2): solo l'email in registrations; il nome resta in user_metadata.
      if (data.session) {
        await supabase.from("registrations").insert({ email: form.email });
      }

      toast.success("Registrazione avviata. Controlla la tua email per confermare l'account.");
      navigate("/verify-email", { state: { email: form.email } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registrazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Crea il tuo account"
      subtitle="Per scaricare SecureLocalShare devi registrarti gratuitamente."
      footer={
        <>
          Hai già un account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Accedi
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome completo">
          <Input required value={form.name} onChange={set("name")} placeholder="Mario Rossi" autoComplete="name" />
        </Field>

        <Field label="Email">
          <Input type="email" required value={form.email} onChange={set("email")} placeholder="mario.rossi@gmail.com" autoComplete="email" />
        </Field>

        <Field label="Password">
          <PasswordInput required value={form.password} onChange={set("password")} autoComplete="new-password" placeholder="Password" />
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {PASSWORD_CHECKS.map((c) => {
              const ok = c.test(form.password);
              return (
                <li key={c.label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-success" : "text-muted-foreground"}`}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                  {c.label}
                </li>
              );
            })}
          </ul>
        </Field>

        <Field label="Conferma password">
          <PasswordInput required value={form.confirm} onChange={set("confirm")} autoComplete="new-password" placeholder="Ripeti la password" />
          {form.confirm.length > 0 && !match && (
            <p className="mt-1 text-xs text-destructive">Le password non coincidono.</p>
          )}
        </Field>

        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <span>
            Accetto i <span className="font-medium text-foreground">Termini di servizio</span> e la{" "}
            <Link
              to="/privacy"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-primary hover:underline"
            >
              Privacy policy
            </Link>
            .
          </span>
        </label>

        <Button type="submit" disabled={!canSubmit} className="bg-brand-gradient shadow-glow hover:opacity-90">
          {busy ? "Registrazione..." : "Crea account e invia verifica"}
        </Button>
      </form>
    </AuthLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
