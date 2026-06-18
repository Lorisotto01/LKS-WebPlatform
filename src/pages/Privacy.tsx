import { ShieldCheck, Trash2, Clock, Fingerprint } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const UPDATED = "17 giugno 2026";

export function Privacy() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Privacy policy</span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Informativa sul trattamento dei dati</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Ultimo aggiornamento: {UPDATED}</p>

        <Section title="1. Titolare e finalità">
          <p>
            SecureLocalShare (LKS) tratta i dati personali al solo scopo di gestire l'account utente, consentire il
            download dell'applicazione e amministrare le licenze software. Non vendiamo né cediamo dati a terzi e non
            utilizziamo i dati per profilazione o pubblicità.
          </p>
        </Section>

        <Section title="2. Dati trattati">
          <p>Raccogliamo il minimo indispensabile (principio di minimizzazione, art. 5.1.c GDPR):</p>
          <ul className="mt-3 space-y-2">
            <DataRow label="Email">
              Identificativo dell'account e canale di verifica/recupero. Base giuridica: esecuzione del contratto.
            </DataRow>
            <DataRow label="Nome">
              Conservato unicamente nei metadati dell'account di autenticazione (user metadata), usato per
              personalizzare l'interfaccia. Non è duplicato in altre tabelle.
            </DataRow>
            <DataRow label="hardware_id (identificativo dispositivo)" icon={Fingerprint}>
              <strong>Trattato come dato personale.</strong> È un identificativo derivato dall'hardware del computer
              su cui viene attivata l'applicazione. Finalità: <em>binding della licenza al dispositivo e prevenzione
              della pirateria</em>. Base giuridica: legittimo interesse del titolare alla tutela del software. Viene
              valorizzato dall'applicazione/dal tool al primo avvio (attivazione) e non viene mai usato per finalità
              diverse.
            </DataRow>
            <DataRow label="Audit dei download">
              Per ogni download registriamo email, versione scaricata e data/ora. <strong>Non</strong> registriamo
              l'indirizzo IP né altri dati di navigazione.
            </DataRow>
            <DataRow label="Attivazioni licenza">
              Token di attivazione, hardware_id, stato e versione dell'app, per gestire la validità della licenza.
            </DataRow>
          </ul>
        </Section>

        <Section title="3. Conservazione (retention)" icon={Clock}>
          <p>
            Manteniamo i dati per il tempo strettamente necessario (art. 5.1.e GDPR):
          </p>
          <ul className="mt-3 space-y-2">
            <DataRow label="Audit dei download">
              Cancellati automaticamente dopo <strong>90 giorni</strong> tramite un job di purge pianificato lato
              database.
            </DataRow>
            <DataRow label="Dati account, licenze e attivazioni">
              Conservati finché l'account è attivo; rimossi alla cancellazione dell'account.
            </DataRow>
          </ul>
        </Section>

        <Section title="4. I tuoi diritti" icon={Trash2}>
          <p>
            Puoi esercitare in qualsiasi momento i diritti di accesso, rettifica, limitazione e cancellazione
            (artt. 15–18 GDPR). In particolare, il <strong>diritto all'oblio</strong> (art. 17) è disponibile in
            autonomia: dalla tua <span className="font-medium text-foreground">Dashboard → Dati account → Elimina
            account</span> puoi rimuovere definitivamente la tua registrazione e tutti i dati collegati (download,
            attivazioni), che vengono eliminati a cascata. L'operazione è irreversibile.
          </p>
        </Section>

        <Section title="5. Sicurezza">
          <p>
            L'accesso ai dati è protetto da autenticazione e da regole di sicurezza a livello di riga (Row Level
            Security): ogni utente può leggere solo i propri dati. Gli artefatti scaricabili sono serviti tramite URL
            firmati a tempo limitato, mai tramite link pubblici permanenti.
          </p>
        </Section>

        <Section title="6. Contatti">
          <p>
            Per qualsiasi richiesta relativa ai tuoi dati puoi scrivere al titolare del trattamento. Questa informativa
            può essere aggiornata: la data in alto indica l'ultima revisione.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function DataRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-border/60 bg-card/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        {label}
      </p>
      <p className="mt-1">{children}</p>
    </li>
  );
}
