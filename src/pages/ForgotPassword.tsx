import { useState, type FormEvent } from "react";
import { useLocation, Link } from "react-router-dom";
import { KeyRound, MailCheck } from "lucide-react";
import { supabase, siteUrl } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPassword() {
  const location = useLocation() as { state?: { email?: string } };
  const toast = useToast();
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl()}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        icon={MailCheck}
        title="Controlla la tua email"
        subtitle={
          <>
            Se esiste un account per <span className="font-medium text-foreground">{email}</span>, riceverai un
            link per reimpostare la password. Il link scade dopo un'ora.
          </>
        }
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Torna al login
          </Link>
        }
      >
        <Button onClick={() => setSent(false)} variant="outline" className="w-full">
          Usa un'altra email
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={KeyRound}
      title="Password dimenticata?"
      subtitle="Inserisci la tua email: ti invieremo un link per crearne una nuova."
      width="sm"
      footer={
        <>
          Te la sei ricordata?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Accedi
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario.rossi@gmail.com" autoComplete="email" />
        </div>
        <Button type="submit" disabled={busy} className="bg-brand-gradient shadow-glow hover:opacity-90">
          {busy ? "Invio…" : "Invia link di reset →"}
        </Button>
      </form>
    </AuthLayout>
  );
}
