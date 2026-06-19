import { useNavigate, Link } from "react-router-dom";
import {
  Download,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  WifiOff,
  Users,
  Github,
  FolderSync,
  MonitorDown,
  Server,
  Smartphone,
  Lock,
  Check,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Logo, LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: MonitorDown, title: "Installa sul PC di casa", text: "Un solo eseguibile firmato. Nessuna configurazione complicata, nessun account cloud richiesto." },
  { icon: Server, title: "Avvia il server LAN", text: "Il backend Spring Boot resta in ascolto sulla tua rete locale, raggiungibile solo da chi è in casa." },
  { icon: Smartphone, title: "Accedi da ogni dispositivo", text: "Apri la Web App da telefono, tablet o un altro PC: le tue password viaggiano solo dentro la LAN." },
];

const FEATURES = [
  { icon: Lock, title: "AES-256-GCM", text: "Ogni vault è un file .lks cifrato con AES-256-GCM. In chiaro non finisce mai nulla, su nessun disco." },
  { icon: KeyRound, title: "PBKDF2 · 310k iter.", text: "La master password è derivata con 310.000 iterazioni PBKDF2: forza bruta resa impraticabile." },
  { icon: WifiOff, title: "Offline-first", text: "Funziona senza Internet. Nessun server di terze parti vede le tue credenziali, mai." },
  { icon: Users, title: "Multi-utente LAN", text: "Più persone, più vault sullo stesso server di casa, ognuno isolato e protetto." },
  { icon: Github, title: "Open source", text: "Codice ispezionabile da chiunque. La sicurezza non si fida delle promesse, si verifica." },
  { icon: FolderSync, title: "LocalDrop file", text: "Condividi file tra i dispositivi della rete, cifrati end-to-end come le password." },
];

const TECH = ["Java 21", "Spring Boot 3.5", "React 18", "Tailwind", "Supabase"];

export function Home() {
  const navigate = useNavigate();
  const goDownload = () => navigate("/register");

  return (
    <div className="min-h-screen">
      <Navbar
        links={[
          { label: "Funzionalità", href: "#funzionalita" },
          { label: "Sicurezza", href: "#sicurezza" },
          { label: "Download", href: "#download" },
        ]}
      />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[480px] bg-hero-glow" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Open source - Offline-first - Zero cloud
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Le tue password.
              <br />
              Sul tuo PC.
              <br />
              <span className="text-brand-gradient">Solo tue.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Un password manager open source che gira sulla{" "}
              <span className="text-foreground">tua rete locale</span>. Niente cloud, niente abbonamenti,
              niente che lasci casa tua.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={goDownload} className="bg-brand-gradient shadow-glow hover:opacity-90">
                <Download className="h-5 w-5" /> Scarica per Windows
              </Button>
              <a href="#funzionalita">
                <Button size="lg" variant="outline">
                  Come funziona <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Windows 10/11 - Java 21 incluso - Nessun account cloud
            </p>
          </div>

          {/* App mockup */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <AppMockup />
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="funzionalita" className="border-t border-border/50 bg-card/20">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading badge="Come funziona" title="Tre passi, zero compromessi" />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="group relative rounded-xl border bg-card/60 p-6 shadow-card transition-colors hover:border-primary/40">
                <span className="absolute right-5 top-5 text-sm font-semibold text-muted-foreground/40">
                  0{i + 1}
                </span>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Security features ---------------- */}
      <section id="sicurezza">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading badge="Sicurezza" title="Pensato per chi non si fida" />
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Crittografia di livello militare, codice aperto, nessun compromesso sull'architettura.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card/60 p-6 shadow-card transition-colors hover:border-primary/40">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>

          {/* Tech badges */}
          <div className="mt-16 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Costruito con tecnologie battle-tested
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {TECH.map((t) => (
                <span key={t} className="rounded-lg border border-border/70 bg-card/60 px-4 py-2 text-sm text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Final CTA ---------------- */}
      <section id="download" className="border-t border-border/50">
        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
          <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-70" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary" /> v1.0 - Disponibile ora
            </span>
            <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Pronto a riprendere
              <br />
              <span className="text-brand-gradient">il controllo?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Crea un account in 30 secondi e scarica l'eseguibile. Nessuna carta richiesta.
            </p>
            <Button size="lg" onClick={goDownload} className="mt-8 bg-brand-gradient shadow-glow hover:opacity-90">
              <Download className="h-5 w-5" /> Scarica gratis
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">
              Windows 10/11 - Open source - Nessuna registrazione a pagamento
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function SectionHeading({ badge, title }: { badge: string; title: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
        {badge}
      </span>
      <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

/** Stylised desktop window mimicking the password-manager UI from the wireframe. */
function AppMockup() {
  const rows = [
    { name: "GitHub.com", user: "lorenzo@dev", dot: "bg-emerald-400" },
    { name: "Amazon", user: "mario.rossi", dot: "bg-amber-400" },
    { name: "Home Banking", user: "**** 4471", dot: "bg-sky-400" },
    { name: "Netflix", user: "famiglia", dot: "bg-rose-400" },
    { name: "ProtonMail", user: "lks@proton.me", dot: "bg-violet-400" },
  ];
  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-glow">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-rose-500/80" />
        <span className="h-3 w-3 rounded-full bg-amber-500/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
        <div className="ml-3 flex items-center gap-2 text-xs text-muted-foreground">
          <LogoMark className="h-4 w-4" /> SecureLocalShare - Vault locale
        </div>
      </div>
      <div className="grid grid-cols-[120px_1fr]">
        <aside className="border-r border-border/60 p-3 text-xs text-muted-foreground">
          <p className="mb-2 flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 font-medium text-primary">
            <KeyRound className="h-3.5 w-3.5" /> Password
          </p>
          <p className="flex items-center gap-2 px-2 py-1.5"><FolderSync className="h-3.5 w-3.5" /> LocalDrop</p>
          <p className="flex items-center gap-2 px-2 py-1.5"><Users className="h-3.5 w-3.5" /> Utenti</p>
          <p className="flex items-center gap-2 px-2 py-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Sicurezza</p>
        </aside>
        <div className="p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium">Le tue password</span>
            <span className="rounded-md bg-brand-gradient px-2 py-1 text-[10px] font-medium text-white">+ Nuova</span>
          </div>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.name} className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary">
                  <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{r.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{r.user}</span>
                </span>
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SiteFooter() {
  // ⚠️ Sostituisci con l'URL reale del tuo repository pubblico.
  const GITHUB_URL = "https://github.com/Lorisotto01/LKS-WebPlatform";
  const cols = [
    {
      title: "Prodotto",
      links: [
        { label: "Funzionalità", to: "#funzionalita", kind: "anchor" as const },
        { label: "Sicurezza", to: "#sicurezza", kind: "anchor" as const },
        { label: "Download", to: "#download", kind: "anchor" as const },
        { label: "Changelog", to: "/changelog", kind: "route" as const },
      ],
    },
    {
      title: "Risorse",
      links: [
        { label: "GitHub", to: GITHUB_URL, kind: "external" as const },
        { label: "Documentazione", to: "/docs", kind: "route" as const },
        { label: "Privacy", to: "/privacy", kind: "route" as const },
        { label: "Termini", to: "/terms", kind: "route" as const },
      ],
    },
  ];
  const cls = "text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <footer className="border-t border-border/50 bg-card/20">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo size="md" />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Password manager open source per la tua rete locale. Tu hai il controllo, sempre.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.kind === "route" ? (
                    <Link to={l.to} className={cls}>
                      {l.label}
                    </Link>
                  ) : l.kind === "external" ? (
                    <a href={l.to} target="_blank" rel="noreferrer" className={cls}>
                      {l.label}
                    </a>
                  ) : (
                    <a href={l.to} className={cls}>
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/40">
        <p className="mx-auto max-w-6xl px-6 py-5 text-xs text-muted-foreground">
          (c) {new Date().getFullYear()} SecureLocalShare - Lorenzo Sottocorno - v4.2.1
        </p>
      </div>
    </footer>
  );
}
