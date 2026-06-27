import { ScrollText } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const UPDATED = "19 giugno 2026";

export function Terms() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 text-primary">
          <ScrollText className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Termini di servizio</span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Termini di servizio</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Ultimo aggiornamento: {UPDATED}</p>

        <Section title="1. Accettazione">
          <p>
            Registrandoti e utilizzando SecureLocalShare (LKS) accetti i presenti termini. Se non li accetti, non
            utilizzare il servizio. Il servizio web consente la registrazione e il download dell'applicazione desktop.
          </p>
        </Section>

        <Section title="2. Licenza d'uso">
          <p>
            SecureLocalShare è un'applicazione proprietaria. Ti è concessa una licenza personale, non esclusiva e non
            trasferibile per installare e utilizzare l'applicazione su un dispositivo attivato. Il codice sorgente
            resta riservato e tutti i diritti sono riservati all'autore.
          </p>
        </Section>

        <Section title="3. Account e attivazione">
          <p>
            Sei responsabile della riservatezza delle tue credenziali e di ogni attività svolta tramite il tuo account.
            L'attivazione lega la licenza al dispositivo tramite un identificativo hardware (vedi Privacy policy). Non è
            consentito eludere i controlli di attivazione o di integrità/firma delle release.
          </p>
        </Section>

        <Section title="4. Uso consentito">
          <p>
            Ti impegni a non usare il servizio per scopi illeciti, a non comprometterne la sicurezza, a non
            decompilare o manomettere i meccanismi di protezione, e a non ridistribuire build alterate spacciandole per
            ufficiali. Le credenziali e i dati gestiti dall'app restano sotto la tua esclusiva responsabilità.
          </p>
        </Section>

        <Section title="5. Esclusione di garanzie">
          <p>
            Il software è fornito "così com'è", senza garanzie di alcun tipo. Pur adottando crittografia robusta, nessun
            sistema è infallibile: sei responsabile dei backup dei tuoi vault e della tua master password, che non può
            essere recuperata se smarrita.
          </p>
        </Section>

        <Section title="6. Limitazione di responsabilità">
          <p>
            Nei limiti consentiti dalla legge, l'autore non è responsabile per perdite di dati, danni diretti o
            indiretti derivanti dall'uso o dall'impossibilità di usare il software.
          </p>
        </Section>

        <Section title="7. Modifiche e legge applicabile">
          <p>
            I presenti termini possono essere aggiornati: la data in alto indica l'ultima revisione. Salvo diversa
            disposizione inderogabile, si applica la legge italiana.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
