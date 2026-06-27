import { Link } from "react-router-dom";
import {
  Server, Smartphone, KeyRound, FolderSync, ShieldCheck, RefreshCw,
  BookOpen, ArrowRight, Lock, Users, Bell, FileSignature, Wifi, Cloud,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { LogoMark } from "@/components/Logo";

type Mock = "desktop" | "webapp" | "password" | "localdrop" | "security" | "updates";

interface FeatureDef {
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  title: string;
  body: string;
  points: string[];
  mock: Mock;
}

const FEATURES: FeatureDef[] = [
  {
    icon: Server,
    badge: "DesktopApp",
    title: "L'app Desktop: il cuore del sistema",
    body: "Installata sul PC di casa (l'host), custodisce il vault cifrato e avvia un piccolo server sulla rete locale. Finché è aperta, gli altri dispositivi possono collegarsi; quando la chiudi, tutto torna irraggiungibile.",
    points: ["Vault cifrato AES-256-GCM su disco", "Server LAN integrato (porta 9505)", "Gestione utenti, accessi e notifiche"],
    mock: "desktop",
  },
  {
    icon: Smartphone,
    badge: "WebApp",
    title: "Accedi da ogni dispositivo, senza installare nulla",
    body: "Da telefono, tablet o un altro PC apri il browser e raggiungi la Web App servita dall'host. Stessa origine, stessa rete: i dati non passano da server esterni e da fuori rete non si vede nulla.",
    points: ["Nessuna installazione sui client", "Sessione tenuta solo in memoria", "Schermata di blocco se l'host è chiuso"],
    mock: "webapp",
  },
  {
    icon: KeyRound,
    badge: "DesktopApp · WebApp",
    title: "Password manager completo",
    body: "Salva le credenziali organizzate in categorie, copiale al volo, mostrale o nascondile, modificale ed eliminale. Tutto sincronizzato tra i dispositivi della tua rete, sempre cifrato.",
    points: ["Categorie e ricerca rapida", "Copia / mostra-nascondi / modifica", "Condivisione cifrata tra utenti"],
    mock: "password",
  },
  {
    icon: FolderSync,
    badge: "DesktopApp · WebApp",
    title: "LocalDrop: file e note tra i tuoi dispositivi",
    body: "Carica file o scrivi note di testo e ritrovali da ogni dispositivo della rete. La compressione di una cartella produce un unico archivio .lkszip cifrato, comodo da spostare e scaricare.",
    points: ["File e note cifrati end-to-end", "Archivio reale .lkszip compresso", "Download quando ti servono"],
    mock: "localdrop",
  },
  {
    icon: ShieldCheck,
    badge: "Sicurezza",
    title: "Licenza legata al dispositivo e blocco anti-intrusione",
    body: "L'attivazione lega la licenza all'hardware del PC. Un sistema di blocco progressivo protegge dai tentativi a forza bruta e dalle manomissioni, con procedure di sblocco dedicate.",
    points: ["Attivazione legata all'HWID", "Blocco progressivo (ENV_LOCK / PERMANENT_LOCK)", "Master password mai trasmessa"],
    mock: "security",
  },
  {
    icon: RefreshCw,
    badge: "DesktopApp",
    title: "Aggiornamenti firmati e verificati",
    body: "Ogni release è firmata (Ed25519) e accompagnata dall'hash SHA-256. L'app controlla da sé le nuove versioni e verifica l'integrità del file prima di installarlo: niente download manomessi.",
    points: ["Firma Ed25519 + hash SHA-256", "Controllo automatico degli update", "Aggiornamenti importanti obbligatori"],
    mock: "updates",
  },
];

export function Funzionalita() {
  return (
    <div className="min-h-screen">
      <Navbar
        links={[
          { label: "Funzionalità", href: "/funzionalita" },
          { label: "Sicurezza", href: "/sicurezza" },
          { label: "Recensioni", href: "/recensioni" },
          { label: "Chi sono", href: "/chi-sono" },
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[320px] bg-hero-glow" />
        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 text-primary" /> Funzionalità
          </span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">Le funzionalità del progetto</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Un ecosistema completo per gestire password e file sulla tua rete di casa: l'app Desktop fa da cuore
            sicuro, la Web App ti dà accesso da ogni dispositivo.
          </p>
        </div>
      </section>

      {/* Feature rows alternate */}
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="space-y-20">
          {FEATURES.map((f, i) => (
            <FeatureRow key={f.title} feature={f} reverse={i % 2 === 1} />
          ))}
        </div>

        {/* CTA finale */}
        <div className="mt-20 rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Pronto a provarlo?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Crea un account e scarica l'app. Tutto resta sul tuo PC, sempre sotto il tuo controllo.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
          >
            Inizia ora <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}

function FeatureRow({ feature, reverse }: { feature: FeatureDef; reverse: boolean }) {
  const { icon: Icon } = feature;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      {/* Mockup */}
      <div className={reverse ? "lg:order-2" : "lg:order-1"}>
        <FeatureMock kind={feature.mock} />
      </div>

      {/* Testo */}
      <div className={reverse ? "lg:order-1" : "lg:order-2"}>
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          {feature.badge}
        </span>
        <h3 className="mt-4 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Icon className="h-6 w-6 text-primary" /> {feature.title}
        </h3>
        <p className="mt-3 text-muted-foreground">{feature.body}</p>
        <ul className="mt-4 space-y-2">
          {feature.points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <Link
          to="/docs"
          className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <BookOpen className="h-4 w-4" /> Leggi la docs <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/* ---------------- mockup stilizzati (palette dark attuale) ---------------- */

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-glow">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-rose-500/80" />
        <span className="h-3 w-3 rounded-full bg-amber-500/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
        <div className="ml-3 flex items-center gap-2 text-xs text-muted-foreground">
          <LogoMark className="h-4 w-4" /> {title}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Bars({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5">
          <span className="h-7 w-7 shrink-0 rounded-md bg-primary/15" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2 w-1/3 rounded bg-muted-foreground/25" />
            <div className="h-2 w-2/3 rounded bg-muted-foreground/15" />
          </div>
          <span className="h-2 w-10 rounded bg-muted-foreground/20" />
        </div>
      ))}
    </div>
  );
}

function FeatureMock({ kind }: { kind: Mock }) {
  switch (kind) {
    case "desktop":
      return (
        <Frame title="SecureLocalShare — Host">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <aside className="space-y-2 rounded-lg border border-border/50 bg-background/40 p-2">
              {[Server, KeyRound, Cloud, Users].map((I, i) => (
                <div key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${i === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                  <I className="h-3.5 w-3.5" /> <span className="h-2 w-10 rounded bg-muted-foreground/25" />
                </div>
              ))}
            </aside>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs text-success">
                <Wifi className="h-4 w-4" /> Server LAN attivo · 192.168.1.50:9505
              </div>
              <Bars rows={3} />
            </div>
          </div>
        </Frame>
      );
    case "webapp":
      return (
        <Frame title="Web App — http://192.168.1.50:9505">
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" /> Accesso dal telefono · stessa rete
          </div>
          <Bars rows={4} />
        </Frame>
      );
    case "password":
      return (
        <Frame title="Password">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {["Tutte", "Social", "Banca", "Lavoro"].map((c, i) => (
              <span key={c} className={`rounded-full px-2 py-0.5 text-[10px] ${i === 0 ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>{c}</span>
            ))}
          </div>
          <Bars rows={4} />
        </Frame>
      );
    case "localdrop":
      return (
        <Frame title="LocalDrop">
          <div className="grid grid-cols-3 gap-2">
            {[FolderSync, Cloud, FileSignature, Bell, Users, Lock].map((I, i) => (
              <div key={i} className="grid place-items-center gap-1 rounded-lg border border-border/50 bg-background/40 py-4 text-primary">
                <I className="h-5 w-5" />
                <span className="h-1.5 w-8 rounded bg-muted-foreground/20" />
              </div>
            ))}
          </div>
        </Frame>
      );
    case "security":
      return (
        <Frame title="Sicurezza & licenza">
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs text-success">
              <ShieldCheck className="h-4 w-4" /> Licenza attiva · dispositivo collegato
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 text-primary" /> AES-256-GCM · PBKDF2 310k
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
              <ShieldCheck className="h-4 w-4" /> Blocco progressivo: 3 / 9 / 10 tentativi
            </div>
          </div>
        </Frame>
      );
    case "updates":
      return (
        <Frame title="Aggiornamenti">
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <span className="inline-flex items-center gap-2 text-primary"><RefreshCw className="h-4 w-4" /> Nuova versione disponibile</span>
              <span className="rounded-md bg-brand-gradient px-2 py-0.5 text-[10px] font-medium text-white">Aggiorna</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs text-success">
              <FileSignature className="h-4 w-4" /> Firma Ed25519 verificata
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" /> SHA-256 corrispondente
            </div>
          </div>
        </Frame>
      );
  }
}
