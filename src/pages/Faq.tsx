import { useEffect } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, ChevronDown, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useSeo, SITE_URL } from "@/lib/seo";

/**
 * FAQ pubblica (task SEO WebPlatform). Le risposte sono in testo semplice così da
 * poter alimentare anche il markup JSON-LD FAQPage (rich snippet) senza divergenze.
 */
interface Faq {
  q: string;
  /** Risposta in testo piano (per JSON-LD). */
  a: string;
  /** Eventuale risposta arricchita per la UI (con link). Se assente usa `a`. */
  render?: React.ReactNode;
}

const FAQS: Faq[] = [
  {
    q: "Cosa succede se il PC di casa è spento?",
    a: "La Web App e i tuoi dati sono raggiungibili solo quando il PC host è acceso e l'app Desktop è aperta: è lì che vive il server della rete locale. A PC spento nulla è accessibile dall'esterno, ma i tuoi dati restano salvi e cifrati sul disco e tornano disponibili non appena riaccendi e riapri l'app.",
  },
  {
    q: "Posso accedere da fuori casa?",
    a: "No, ed è una scelta di sicurezza precisa. Tutto (vault, password, file) viaggia solo sulla tua rete locale: da fuori rete non è raggiungibile nulla. Questo elimina l'intera categoria di attacchi da Internet. Internet viene usato solo per scaricare l'app e gestire la licenza, mai per i contenuti del vault.",
  },
  {
    q: "Se dimentico la master password perdo tutto?",
    a: "La master password non viene mai trasmessa né salvata da noi: non è recuperabile in alcun modo. È la chiave che cifra il tuo vault, quindi senza di essa il vault non è apribile. Conservala con cura (ad esempio in un posto fisico sicuro): è il prezzo della privacy totale, perché nessuno tranne te può accedere ai tuoi dati.",
  },
  {
    q: "Cosa succede se sbaglio troppe volte la master password (PERMANENT_LOCK)?",
    a: "Il blocco è progressivo: i primi errori si riassorbono da soli e al 3° tentativo scatta solo un blocco temporaneo di 10 minuti. Dopo 10 tentativi falliti scatta il PERMANENT_LOCK, pensato per fermare gli attacchi a forza bruta. In quel caso serve un file unlock.lks firmato dall'autore per sbloccare il dispositivo. Fondamentale: il vault e i tuoi dati restano sempre intatti, non vengono cancellati — al termine dello sblocco ti verranno chieste la master password attuale (necessaria per riavvolgere il vault) e una nuova.",
    render: (
      <>
        Il blocco è progressivo: i primi errori si riassorbono da soli e al 3° tentativo scatta solo un
        blocco temporaneo di 10 minuti. Dopo 10 tentativi falliti scatta il{" "}
        <span className="font-mono text-destructive">PERMANENT_LOCK</span>, pensato per fermare gli
        attacchi a forza bruta. In quel caso serve un file <code>unlock.lks</code> firmato dall'autore
        per sbloccare il dispositivo. Fondamentale: il vault e i tuoi dati restano sempre intatti, non
        vengono cancellati — al termine ti verranno chieste la master password attuale (necessaria per
        riavvolgere il vault) e una nuova.{" "}
        <Link to="/sicurezza#tipi-di-blocco" className="font-medium text-primary hover:underline">
          Approfondisci i tipi di blocco
        </Link>
        .
      </>
    ),
  },
  {
    q: "Devo pagare un abbonamento?",
    a: "No. Puoi iniziare gratis con il piano Free e usarlo senza scadenze. I piani Essential e Pro sono opzionali e servono solo se vuoi più utenti, più spazio o gli sconti sugli sblocchi di licenza. Nessun vincolo: cambi o disdici quando vuoi.",
    render: (
      <>
        No. Puoi iniziare gratis con il piano Free e usarlo senza scadenze. I piani Essential e Pro sono
        opzionali e servono solo se vuoi più utenti, più spazio o gli sconti sugli sblocchi di licenza.
        Nessun vincolo: cambi o disdici quando vuoi.{" "}
        <Link to="/pricing" className="font-medium text-primary hover:underline">
          Vedi i prezzi
        </Link>
        .
      </>
    ),
  },
  {
    q: "È davvero sicuro? Che crittografia usa?",
    a: "Ogni vault è un file cifrato con AES-256-GCM: sul disco non finisce mai nulla in chiaro. La chiave è derivata in locale dalla tua master password e la licenza è legata all'hardware del PC. Non esiste un server centrale con le tue credenziali da poter violare.",
    render: (
      <>
        Ogni vault è un file cifrato con AES-256-GCM: sul disco non finisce mai nulla in chiaro. La
        chiave è derivata in locale dalla tua master password e la licenza è legata all'hardware del PC.
        Non esiste un server centrale con le tue credenziali da poter violare.{" "}
        <Link to="/sicurezza" className="font-medium text-primary hover:underline">
          Come funziona la sicurezza
        </Link>
        .
      </>
    ),
  },
];

export function Faq() {
  useSeo({
    title: "FAQ — SecureLocalShare | Domande frequenti",
    description:
      "Risposte alle domande più comuni su SecureLocalShare: accesso da fuori casa, PC spento, master password dimenticata, blocchi di sicurezza PERMANENT_LOCK, prezzi e crittografia.",
    path: "/faq",
  });

  // Inietta il markup JSON-LD FAQPage per i rich snippet, e rimuovilo allo smontaggio.
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo", "faq");
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      url: `${SITE_URL}/faq`,
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar
        links={[
          { label: "Funzionalità", href: "/funzionalita" },
          { label: "Sicurezza", href: "/sicurezza" },
          { label: "Prezzi", href: "/pricing" },
          { label: "FAQ", href: "/faq" },
          { label: "Chi sono", href: "/chi-sono" },
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[320px] bg-hero-glow" />
        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5 text-primary" /> FAQ
          </span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">Domande frequenti</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Le risposte alle domande più comuni su come funziona SecureLocalShare, la privacy e i
            blocchi di sicurezza.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border bg-card/50 shadow-card transition-colors open:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">
                {f.render ?? f.a}
              </div>
            </details>
          ))}
        </div>

        {/* CTA finale */}
        <div className="mt-14 rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Non hai trovato la risposta?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            La documentazione spiega ogni funzione nel dettaglio, incluse le procedure di sblocco.
          </p>
          <Link
            to="/docs"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
          >
            Vai alla documentazione <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
