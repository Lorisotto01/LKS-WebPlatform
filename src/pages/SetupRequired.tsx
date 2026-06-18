import { LogoMark } from "@/components/Logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown when the Supabase env vars are not configured. */
export function SetupRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <LogoMark className="mx-auto h-12 w-12" />
          <CardTitle>Configurazione richiesta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="text-muted-foreground">
            Le variabili d'ambiente Supabase non sono impostate. Crea un file
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5">.env</code>
            nella root del progetto (vedi <code className="rounded bg-muted px-1.5 py-0.5">.env.example</code>):
          </p>
          <pre className="rounded-md border bg-muted/40 p-3 font-mono text-xs">
{`VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
          </pre>
          <p className="text-muted-foreground">
            Poi riavvia il dev server (<code className="rounded bg-muted px-1.5 py-0.5">npm run dev</code>).
            Su Netlify imposta le stesse variabili in <em>Site settings → Environment variables</em>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
