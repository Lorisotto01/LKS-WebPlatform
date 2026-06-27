import { Link } from "react-router-dom";
import {
  ShieldCheck, Lock, KeyRound, WifiOff, ServerOff, EyeOff, Fingerprint,
  ShieldAlert, Ban, Timer, FileWarning, Globe, ArrowRight,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";

export function Sicurezza() {
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
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[360px] bg-hero-glow" />
        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Sicurezza
          </span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Perché è <span className="text-brand-gradient">davvero</span> sicuro
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            La maggior parte dei vault online custodisce le tue password sui propri server. SecureLocalShare fa
            l'opposto: i dati restano cifrati sul tuo PC e non lasciano mai la tua rete di casa.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-4xl px-6 py-14">
        {/* Differenza dagli altri vault */}
        <SectionHeading icon={Lock} title="Cosa ci rende diversi dagli altri vault" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Feature icon={ServerOff} title="Nessun server centrale">
            Non esiste un nostro database con le tue credenziali. Un attaccante non ha un unico bersaglio da violare:
            ogni vault vive solo sul PC del suo proprietario.
          </Feature>
          <Feature icon={Lock} title="Cifratura AES-256-GCM">
            Ogni vault è un file <code>.lks</code> cifrato con AES-256-GCM. Sul disco non finisce mai nulla in chiaro,
            nemmeno temporaneamente.
          </Feature>
          <Feature icon={KeyRound} title="Master password mai trasmessa">
            La chiave è derivata dalla tua master password con PBKDF2 a 310.000 iterazioni, in locale. La password non
            viene mai inviata da nessuna parte e non è recuperabile da noi.
          </Feature>
          <Feature icon={WifiOff} title="Offline-first">
            Il vault funziona senza Internet. La Web App e l'app Desktop dialogano solo sulla tua LAN: da fuori rete non
            è raggiungibile nulla.
          </Feature>
          <Feature icon={Fingerprint} title="Licenza legata al dispositivo">
            L'attivazione lega la licenza all'hardware del PC (HWID). Copiare i file su un altro computer non basta per
            sbloccare il vault.
          </Feature>
          <Feature icon={EyeOff} title="Minimizzazione dei dati">
            Non raccogliamo il tuo indirizzo IP e i file di sblocco non contengono dati personali: trasportano solo
            l'HWID e un nonce monouso.
          </Feature>
        </div>

        {/* I due tipi di blocco */}
        <div className="mt-16">
          <SectionHeading icon={ShieldAlert} title="I due tipi di blocco: cause ed effetti" />
          <p className="mt-3 text-muted-foreground">
            Per proteggerti da manomissioni e tentativi di accesso non autorizzati, l'app può entrare in uno stato di
            blocco. Esistono due tipologie, con cause ed effetti diversi.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* ENV_LOCK */}
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6 shadow-card">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning">
                  <FileWarning className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-mono text-sm font-bold text-warning">ENV_LOCK</h3>
                  <p className="text-xs text-muted-foreground">Manomissione dell'ambiente</p>
                </div>
              </div>
              <Dl>
                <Dt>Causa</Dt>
                <Dd>
                  L'app rileva che il file <code>environment.lks</code> (lo stato cifrato del dispositivo) è stato
                  modificato, spostato o corrotto: un segnale di possibile manomissione.
                </Dd>
                <Dt>Effetto</Dt>
                <Dd>
                  Blocco immediato dell'accesso al vault, indipendentemente dai tentativi di password. L'app genera un
                  file <code>lock.lks</code> per l'eventuale procedura con l'autore.
                </Dd>
                <Dt>Conseguenza importante</Dt>
                <Dd>
                  <strong className="text-warning">Il recupero tramite master password azzera le credenziali:</strong>{" "}
                  dimostrando il possesso della master password ripristini l'accesso, ma l'ambiente viene ricostruito e
                  le credenziali di sessione vengono azzerate per sicurezza. Il vault e i suoi dati restano intatti.
                </Dd>
              </Dl>
            </div>

            {/* PERMANENT_LOCK */}
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-card">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/15 text-destructive">
                  <Ban className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-mono text-sm font-bold text-destructive">PERMANENT_LOCK</h3>
                  <p className="text-xs text-muted-foreground">Tentativi esauriti</p>
                </div>
              </div>
              <Dl>
                <Dt>Causa</Dt>
                <Dd>
                  Sono stati raggiunti i <strong>10 tentativi</strong> di accesso falliti (vedi flusso sotto): l'app
                  presume un attacco a forza bruta.
                </Dd>
                <Dt>Effetto</Dt>
                <Dd>
                  Blocco permanente del dispositivo. Non basta più la master password: serve un file{" "}
                  <code>unlock.lks</code> firmato dall'autore.
                </Dd>
                <Dt>Conseguenza importante</Dt>
                <Dd>
                  Lo sblocco avviene solo applicando l'<code>unlock.lks</code>, che viene verificato per{" "}
                  <strong>firma digitale, hardware ID e scadenza</strong> prima di ripristinare l'accesso. Senza un
                  file valido il vault resta inaccessibile su quel PC.
                </Dd>
              </Dl>
            </div>
          </div>
        </div>

        {/* Flussi di blocco */}
        <div className="mt-16">
          <SectionHeading icon={Timer} title="Tutti i flussi di blocco" />
          <p className="mt-3 text-muted-foreground">
            Il blocco è <strong>progressivo</strong>: ogni passo ha una conseguenza precisa, pensata per rallentare gli
            attacchi senza penalizzare un errore occasionale.
          </p>
          <ol className="mt-6 space-y-3">
            <Flow n="1" tone="ok" title="Tentativi 1–2 falliti">
              Nessun blocco. Il contatore dei fallimenti si <strong>decrementa di 1 ogni 10 minuti</strong> di
              inattività: gli errori sporadici si “riassorbono” da soli.
            </Flow>
            <Flow n="2" tone="warn" title="3° tentativo fallito → blocco temporaneo">
              Scatta un <strong>blocco temporaneo di 10 minuti</strong>. Trascorso il tempo puoi riprovare; il contatore
              continua a decrescere durante l'attesa.
            </Flow>
            <Flow n="3" tone="warn" title="9° tentativo fallito → avviso critico">
              L'app mostra un avviso esplicito: <strong>è rimasto un solo tentativo</strong> prima del blocco
              permanente.
            </Flow>
            <Flow n="4" tone="danger" title="10° tentativo fallito → PERMANENT_LOCK">
              Blocco permanente del dispositivo. Sbloccabile esclusivamente con un <code>unlock.lks</code> firmato
              dall'autore.
            </Flow>
            <Flow n="!" tone="warn" title="Manomissione environment.lks → ENV_LOCK (in qualsiasi momento)">
              Indipendente dal contatore: se l'ambiente viene alterato, il blocco scatta subito. Recuperabile dal
              proprietario con la master password (che <strong>azzera le credenziali</strong>) o con un{" "}
              <code>unlock.lks</code> dell'autore.
            </Flow>
          </ol>
          <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
            Le procedure passo-passo per risolvere ENV_LOCK e PERMANENT_LOCK sono spiegate nella{" "}
            <Link to="/docs" className="font-medium text-primary hover:underline">
              documentazione
            </Link>
            , nella sezione “Aggiornamenti, blocco e attivazione”.
          </div>
        </div>

        {/* Richieste internet */}
        <div className="mt-16">
          <SectionHeading icon={Globe} title="Le uniche richieste che usano Internet" />
          <p className="mt-3 text-muted-foreground">
            Tutto il resto — vault, password, file, condivisioni — viaggia <strong>solo sulla tua rete locale</strong>.
            Internet viene usato esclusivamente per queste operazioni, e mai per i contenuti del vault:
          </p>
          <ul className="mt-6 space-y-3">
            <Net title="Registrazione e accesso al sito" detail="Crea l'account e autentica l'utente (Supabase Auth) per poter scaricare l'app. Avviene solo sul sito, non dal vault." />
            <Net title="Download dell'eseguibile" detail="Genera un link firmato temporaneo (valido 10 minuti) per scaricare l'app dallo storage. Nessun file del vault è coinvolto." />
            <Net title="Attivazione del dispositivo" detail="Al primo avvio l'app lega l'HWID al token di attivazione (bind_activation). Serve a impedire la duplicazione della licenza su più PC." />
            <Net title="Validazione della licenza" detail="Verifica che la licenza sia attiva e legata a questo hardware (validate_license). Conferma solo lo stato, non trasmette credenziali." />
            <Net title="Controllo aggiornamenti" detail="Confronta la versione installata con l'ultima pubblicata per proporre (o imporre) l'update. Legge solo i metadati di release." />
            <Net title="Invio segnalazioni" detail="Quando apri un bug/idea dall'app (open_report). Vengono inviati solo i campi della segnalazione che decidi tu, mai il vault." />
          </ul>
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              In sintesi: Internet serve solo a <strong>distribuire l'app e gestire la licenza</strong>. Le tue
              password non transitano mai da un server esterno.
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 rounded-2xl border border-border/60 bg-card/40 p-6 text-center">
          <p className="text-muted-foreground">
            Vuoi capire come funziona nel dettaglio?{" "}
            <Link to="/docs" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Leggi la documentazione <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function SectionHeading({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
      <Icon className="h-6 w-6 text-primary" /> {title}
    </h2>
  );
}

function Feature({
  icon: Icon, title, children,
}: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card/60 p-5 shadow-card transition-colors hover:border-primary/40">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Dl({ children }: { children: React.ReactNode }) {
  return <dl className="mt-4 space-y-2 text-sm">{children}</dl>;
}
function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{children}</dt>;
}
function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="text-muted-foreground">{children}</dd>;
}

function Flow({
  n, tone, title, children,
}: {
  n: string;
  tone: "ok" | "warn" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "danger"
      ? "bg-destructive/15 text-destructive"
      : tone === "warn"
      ? "bg-warning/15 text-warning"
      : "bg-success/15 text-success";
  return (
    <li className="flex gap-3 rounded-xl border bg-card/50 p-4 shadow-card">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${toneCls}`}>{n}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function Net({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="flex gap-3 rounded-xl border bg-card/50 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Globe className="h-4 w-4" />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}
