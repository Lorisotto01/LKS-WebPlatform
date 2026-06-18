import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

export function VerifyEmail() {
  const location = useLocation() as { state?: { email?: string } };
  const navigate = useNavigate();
  const toast = useToast();
  const { session } = useAuth();
  const email = location.state?.email ?? "";
  const [busy, setBusy] = useState(false);

  // When the user lands here from the confirmation link, a session is established.
  useEffect(() => {
    if (session) {
      toast.success("Email verificata. Benvenuto!");
      navigate("/dashboard", { replace: true });
    }
  }, [session, navigate, toast]);

  const resend = async () => {
    if (!email) {
      toast.error("Email non disponibile, effettua di nuovo la registrazione.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Email di verifica reinviata.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      icon={MailCheck}
      title="Verifica la tua email"
      subtitle={
        <>
          Abbiamo inviato un link di conferma
          {email ? (
            <>
              {" "}a <span className="font-medium text-foreground">{email}</span>
            </>
          ) : null}
          . Aprilo per attivare l'account, poi torna qui per accedere.
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button variant="outline" onClick={resend} disabled={busy} className="flex-1">
          {busy ? "Invio…" : "Reinvia email"}
        </Button>
        <Button
          onClick={() => navigate("/login", { state: { email } })}
          className="flex-1 bg-brand-gradient shadow-glow hover:opacity-90"
        >
          Vai al login
        </Button>
      </div>
    </AuthLayout>
  );
}
