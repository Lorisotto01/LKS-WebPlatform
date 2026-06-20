import { Link } from "react-router-dom";
import {
  BookOpen, MonitorDown, Server, Smartphone, KeyRound, ShieldCheck, Users,
  FolderSync, Bell, Lock, RefreshCw, Download, HelpCircle, Wifi,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";

export function Docs() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 text-primary">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Documentazione</span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Guida a SecureLocalShare</h1>
        <p className="mt-2 text-muted-foreground">
          Come installare e usare SecureLocalShare: il tuo password manager che vive sulla tua rete di casa,
          senza cloud e senza abbonamenti.
        </p>

        {/* Indice */}
        <nav className="mt-6 rounded-xl border bg-card/40 p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Indice</p>
          <ol className="flex flex-col gap-1.5">
            {[
              ["#cos-e", "1. Cos'è e come funziona"],
              ["#requisiti", "2. Requisiti"],
              ["#installazione", "3. Installazione e primo avvio"],
              ["#desktop", "4. L'app Desktop (il cuore del sistema)"],
              ["#webapp", "5. Accedere dagli altri dispositivi"],
              ["#funzioni", "6. Cosa puoi fare"],
              ["#collegamento", "7. Il collegamento tra Web App e Desktop"],
              ["#sicurezza", "8. Sicurezza e privacy"],
              ["#aggiornamenti", "9. Aggiornamenti, blocco e attivazione"],
              ["#faq", "10. Problemi comuni (FAQ)"],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="text-muted-foreground hover:text-foreground hover:underline">{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1 */}
        <Section id="cos-e" icon={ShieldCheck} title="1. Cos'è e come funziona">
          <p>
            SecureLocalShare (LKS) è un gestore di password e file <strong>locale</strong>: i tuoi dati non finiscono
            mai su un cloud. Funziona così: su un computer di casa (il "PC host") installi l'<strong>app Desktop</strong>,
            che custodisce i dati cifrati e avvia un piccolo server sulla tua rete. Dagli altri dispositivi
            (telefono, tablet, un altro PC) apri la <strong>Web App</strong> dal browser, restando però sempre
            <strong> dentro la tua rete locale</strong>. Niente lascia casa tua.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniCard icon={Server} title="PC host">L'app Desktop conserva il vault cifrato e fa da server.</MiniCard>
            <MiniCard icon={Wifi} title="Rete locale">Tutto viaggia solo sul Wi-Fi/LAN di casa, mai su Internet.</MiniCard>
            <MiniCard icon={Smartphone} title="Altri dispositivi">Accedi via browser alla Web App servita dal PC host.</MiniCard>
          </div>
        </Section>

        {/* 2 */}
        <Section id="requisiti" icon={MonitorDown} title="2. Requisiti">
          <ul className="space-y-1.5">
            <Bullet><strong>PC host:</strong> Windows 10 o 11 (64-bit). Java è già incluso nell'installer, non devi installarlo.</Bullet>
            <Bullet><strong>Altri dispositivi:</strong> un browser moderno (telefono, tablet, PC), connessi alla <strong>stessa rete</strong> del PC host.</Bullet>
            <Bullet><strong>Account:</strong> una registrazione gratuita su questo sito per scaricare l'app.</Bullet>
          </ul>
        </Section>

        {/* 3 */}
        <Section id="installazione" icon={Download} title="3. Installazione e primo avvio">
          <Steps
            items={[
              ["Registrati e scarica", <>Crea un account gratuito e scarica l'eseguibile dalla tua <Link to="/register" className="text-primary hover:underline">dashboard</Link>. L'app è firmata e include tutto il necessario.</>],
              ["Avvia l'app sul PC host", <>Apri il file scaricato sul computer che vuoi usare come host. Al primo avvio l'app prepara l'ambiente di lavoro.</>],
              ["Attiva il dispositivo", <>Inserisci email e <strong>codice di attivazione</strong> (lo trovi nella dashboard del sito): collega la licenza a questo computer.</>],
              ["Crea la master password", <>Imposta la password principale che protegge il tuo vault. <strong>Custodiscila bene:</strong> non è recuperabile e senza di essa i dati non si aprono.</>],
            ]}
          />
        </Section>

        {/* 4 */}
        <Section id="desktop" icon={Server} title="4. L'app Desktop (il cuore del sistema)">
          <p>
            L'app Desktop è il centro di tutto. Tenendola aperta sul PC host, essa: custodisce il <strong>vault cifrato</strong>,
            avvia il <strong>server</strong> che pubblica la Web App sulla rete locale, e gestisce utenti, accessi e
            aggiornamenti. Quando chiudi l'app, il server si ferma e i dati non sono più raggiungibili dagli altri
            dispositivi — un'ulteriore garanzia di controllo.
          </p>
          <p>
            Dalla finestra principale puoi gestire le tue voci, vedere lo stato del sistema, gli accessi e le
            notifiche. È pensata per restare in esecuzione sul computer di casa, un po' come un piccolo server personale.
          </p>
        </Section>

        {/* 5 */}
        <Section id="webapp" icon={Smartphone} title="5. Accedere dagli altri dispositivi (Web App)">
          <p>
            Dagli altri dispositivi non serve installare nulla: apri il browser e vai all'indirizzo del PC host sulla
            rete locale, sulla porta <strong>9505</strong>:
          </p>
          <pre className="my-3 overflow-x-auto rounded-lg border bg-card/50 p-3 font-mono text-sm">http://INDIRIZZO-IP-DEL-PC:9505</pre>
          <p>
            Dove <code>INDIRIZZO-IP-DEL-PC</code> è l'IP locale del computer host (es. <code>192.168.1.50</code>). Da lì
            accedi con il tuo utente e ritrovi password e file, tutti serviti in sicurezza dal PC host. Suggerimento:
            salva l'indirizzo tra i preferiti del telefono.
          </p>
        </Section>

        {/* 6 */}
        <Section id="funzioni" icon={KeyRound} title="6. Cosa puoi fare">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniCard icon={KeyRound} title="Password">
              Salva credenziali organizzate in categorie. Copia al volo, mostra/nascondi, modifica ed elimina.
            </MiniCard>
            <MiniCard icon={Users} title="Condivisione tra utenti">
              Condividi una password o un file con un altro utente della stessa rete, in modo cifrato.
            </MiniCard>
            <MiniCard icon={FolderSync} title="LocalDrop (file e note)">
              Carica file o scrivi note di testo e ritrovali da ogni dispositivo della rete; scaricali quando servono.
            </MiniCard>
            <MiniCard icon={Bell} title="Notifiche">
              Ricevi un avviso (campanella) quando qualcuno condivide qualcosa con te.
            </MiniCard>
          </div>
        </Section>

        {/* 7 */}
        <Section id="collegamento" icon={Wifi} title="7. Il collegamento tra Web App e Desktop">
          <p>
            La Web App e l'app Desktop parlano tra loro <strong>solo sulla tua rete locale</strong>. Il PC host pubblica
            la Web App (porta 9505) e gestisce le richieste sullo stesso indirizzo: il browser e il server condividono
            la stessa origine, quindi nessun dato passa da server esterni e le richieste da fuori rete vengono
            rifiutate.
          </p>
          <ul className="mt-2 space-y-1.5">
            <Bullet>Quando accedi, ricevi un <strong>token di sessione</strong> tenuto solo in memoria (mai salvato nel browser): chiudendo la scheda, la sessione decade.</Bullet>
            <Bullet>Se il vault è chiuso o la sessione è scaduta, la Web App ti riporta al login.</Bullet>
            <Bullet>Se il sistema è in stato di <strong>blocco</strong> di sicurezza, la Web App mostra una schermata "Sistema bloccato" finché non viene sbloccato dal PC host.</Bullet>
          </ul>
          <Callout>
            In pratica: la Web App è una "finestra" sul tuo PC host. Se il PC è spento o l'app è chiusa, da fuori non
            si vede nulla — ed è esattamente l'idea.
          </Callout>
        </Section>

        {/* 8 */}
        <Section id="sicurezza" icon={Lock} title="8. Sicurezza e privacy">
          <ul className="space-y-1.5">
            <Bullet>I vault sono cifrati con <strong>AES-256-GCM</strong>: in chiaro non finisce nulla su disco.</Bullet>
            <Bullet>La <strong>master password</strong> protegge tutto e <strong>non è recuperabile</strong>: fai sempre un backup mentale/sicuro.</Bullet>
            <Bullet>Nessun cloud, nessun server di terze parti vede le tue credenziali. Non viene raccolto il tuo indirizzo IP.</Bullet>
            <Bullet>L'identificativo del dispositivo serve solo a legare la licenza al PC host (anti-pirateria). Vedi la <Link to="/privacy" className="text-primary hover:underline">Privacy policy</Link>.</Bullet>
          </ul>
        </Section>

        {/* 9 */}
        <Section id="aggiornamenti" icon={RefreshCw} title="9. Aggiornamenti, blocco e attivazione">
          <ul className="space-y-1.5">
            <Bullet><strong>Aggiornamenti:</strong> l'app controlla da sé la presenza di nuove versioni all'accesso e ti guida nell'installarle (gli aggiornamenti importanti possono essere obbligatori).</Bullet>
            <Bullet><strong>Attivazione:</strong> ogni PC host va attivato una volta col codice della dashboard; la licenza resta legata a quel dispositivo.</Bullet>
            <Bullet><strong>Blocco di sicurezza:</strong> in caso di manomissioni o troppi tentativi falliti, l'app può bloccarsi. Lo sblocco avviene con una procedura dedicata dal PC host.</Bullet>
          </ul>
        </Section>

        {/* 10 */}
        <Section id="faq" icon={HelpCircle} title="10. Problemi comuni (FAQ)">
          <Faq q="Dal telefono non riesco ad aprire la Web App.">
            Verifica che telefono e PC host siano sulla <strong>stessa rete</strong>, che l'app Desktop sia avviata, e
            che il firewall di Windows consenta la porta 9505. Controlla di aver scritto l'IP corretto del PC.
          </Faq>
          <Faq q="Ho dimenticato la master password.">
            Non è recuperabile per scelta di sicurezza: senza di essa il vault non può essere aperto. Conservala in un
            luogo sicuro.
          </Faq>
          <Faq q="Windows segnala l'app come non riconosciuta al download/avvio.">
            È normale per un'app nuova non ancora "famosa" agli occhi di Windows/Chrome: puoi procedere con "Esegui
            comunque". La segnalazione diminuisce col tempo man mano che l'app viene scaricata.
          </Faq>
          <Faq q="Posso usarla fuori casa?">
            Per progetto funziona solo nella rete locale del PC host. Fuori da quella rete la Web App non è raggiungibile.
          </Faq>
        </Section>

        <div className="mt-10 rounded-lg border border-border/60 bg-card/40 p-5 text-sm text-muted-foreground">
          Pronto a iniziare?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">Crea un account</Link>{" "}
          e scarica l'ultima versione dalla dashboard.
        </div>
      </main>
    </div>
  );
}

/* ---------- componenti di supporto ---------- */

function Section({
  id, icon: Icon, title, children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-20">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function MiniCard({
  icon: Icon, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}

function Steps({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <ol className="mt-2 space-y-3">
      {items.map(([title, body], i) => (
        <li key={i} className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card/40 p-4">
      <p className="text-sm font-semibold text-foreground">{q}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
