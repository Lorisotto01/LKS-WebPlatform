import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

// Il client Supabase si carica in modo asincrono: così non entra nel bundle iniziale della landing
// (le pagine che lo importano direttamente sono già caricate in lazy da App.tsx).
const loadSupabase = () => import("@/lib/supabase").then((m) => m.supabase);

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when the user's app_metadata.role === 'admin' (set only via service_role/Dashboard). */
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    loadSupabase().then((supabase) => {
      if (cancelled) return;
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
      unsubscribe = () => sub.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signOut = async () => { await (await loadSupabase()).auth.signOut(); };

  const user = session?.user ?? null;
  const isAdmin = (user?.app_metadata?.role as string | undefined) === "admin";

  return (
    <Ctx.Provider value={{ session, user, loading, isAdmin, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
