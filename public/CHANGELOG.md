# Changelog — SecureLocalShare (LKS)

Storico delle modifiche rilevanti del progetto, raggruppate per modulo:
`desktop` (app Java), `webapp` (frontend React servito dal desktop), `webplatform`
(sito di distribuzione), `tool-cli` (strumento di sblocco/firma, uso autore).

**Versioning — `MAJOR.MINOR.PATCH`**

| Segmento | Avanza quando |
|----------|----------------|
| **MAJOR** | cambio architetturale o rottura di compatibilità |
| **MINOR** | nuova funzionalità o nuovo modulo |
| **PATCH** | bugfix, allineamenti, rifiniture |

Più interventi nella stessa sessione condividono la stessa versione, distinti per scope.
Versione corrente: **4.8.0**.

---

## [Non rilasciato]

### `webplatform` — ciclo di vita degli ordini: TTL, annullamento e checkout atomico

Task "Errore ordini WebPlatform". Tre difetti distinti dello stesso flusso: un
checkout fallito lasciava un ordine fantasma, un checkout abbandonato restava
`pending` per sempre, e l'errore del provider non arrivava mai all'utente.

- **Nessun record prima del redirect.** `create-checkout` non inserisce più
  l'ordine come prima operazione: genera l'uuid in anticipo (serve a Stripe come
  `metadata[order_id]`), apre la sessione presso il provider e scrive la riga
  **solo** a sessione ottenuta. Se il provider rifiuta — chiave errata, importo
  non valido, rete — la chiamata torna in errore senza aver creato nulla. Nel
  caso opposto (sessione creata ma insert fallito) la sessione Stripe viene
  chiusa con `/expire`, così non può esistere un pagamento senza ordine.
- **TTL di 30 minuti.** Nuova colonna `orders.expires_at`, allineata alla
  scadenza reale della sessione Stripe (`expires_at` sulla sessione in
  `mode=payment`). Il job pg_cron `expire_stale_orders_5min` marca `failed` i
  `pending` scaduti; il webhook `checkout.session.expired` fa lo stesso senza
  attendere il giro di cron. Un pagamento che arrivasse comunque in ritardo
  resta recuperabile: `finalizeOrder` porta a `paid` anche un ordine `failed`.
- **Stato derivato lato UI.** Dashboard e pannello admin ricalcolano lo stato da
  `expires_at`, così un ordine scaduto non appare mai "in attesa" nei minuti che
  separano la scadenza dal passaggio del cron.
- **Annullamento esplicito.** Nuova RPC `cancel_my_order`: tornando dal
  `cancel_url` del provider l'ordine passa subito a `canceled`, distinto dal
  `failed` da TTL scaduto perché è una rinuncia, non un tentativo a vuoto.
- **Badge e ripetizione dell'ordine.** In dashboard i quattro stati hanno ora
  colori distinti (verde/giallo/**rosso**/grigio) invece di "verde se pagato,
  giallo tutto il resto"; gli ordini chiusi mostrano l'importo barrato e un
  pulsante **Riprova** che riapre `/checkout` con gli stessi parametri.
- **Errori del provider leggibili.** `functions.invoke` scartava il corpo delle
  risposte non-2xx e mostrava "Edge Function returned a non-2xx status code":
  ora il messaggio viene letto da `error.context` e arriva all'utente. Aggiunte
  guardie preventive su `create-checkout`: chiave Stripe che non sia una secret
  (`sk_`/`rk_`), importo sotto il minimo Stripe di 0,50 €, credenziali PayPal
  non valide e `planCode`/`billingCycle`/`lockType` fuori dominio.
- `simulate-payment` rifiuta con `410` gli ordini scaduti o annullati.

### `webplatform` — `01_wipe_all.sql` allineato ai vincoli attuali di Supabase

- **Lo storage non si azzera più da SQL.** Supabase blocca le `delete` dirette su
  `storage.objects` con il trigger `storage.protect_delete()`, e lo script si
  fermava con `42501`. Il blocco sana un difetto che lo script ammetteva da sé:
  cancellare quelle righe rimuoveva i metadati ma lasciava i file nel backend,
  orfani. Lo svuotamento passa ora dalla Storage API con il nuovo
  `scripts/wipe-storage.mjs` (`npm run db:wipe:storage`, con `--dry-run` e
  conferma esplicita), che preserva `assets` e cancella i file davvero. Il wipe
  SQL si limita a contare cosa resta, senza fallire.
- **I job pg_cron vengono disiscritti dal wipe.** Vivono nello schema `cron`, che
  `drop schema public cascade` non tocca: sopravvivevano all'azzeramento
  invocando funzioni inesistenti. Trascurabile finché il solo job era il purge
  giornaliero, non più con `expire_stale_orders_5min` che gira ogni cinque
  minuti. Vengono rimossi per nome, lasciando intatti eventuali job manuali.

### `desktop` — cartella runtime spostata in `%ProgramData%\SecureLocalShare`

- **Nuova root dei dati**: l'albero runtime non vive più in `%USERPROFILE%\Password_Saver_v3`
  ma in `%ProgramData%\SecureLocalShare` (`RuntimePaths.ROOT_DIR_NAME` + il nuovo
  `RuntimePaths.defaultBase()`, che legge la variabile `ProgramData` e ricade sulla home
  utente dove non è definita). I dati diventano così condivisi a livello di macchina invece
  di essere legati a un singolo profilo Windows.
- **Migrazione automatica al primo avvio**: `RuntimePaths.resolveForStartup` sposta un albero
  `Password_Saver_v3` preesistente nella nuova posizione e ne registra il percorso nel pointer
  file. La migrazione parte solo se la nuova root non esiste ancora, così non sovrascrive mai
  dati vivi; se lo spostamento fallisce (volume diverso, file bloccato, permessi mancanti) la
  cartella legacy resta al suo posto e viene usata così com'è, senza perdita di dati.
- `resolveOrCreate` resta ermetico (nessuna migrazione, nessun pointer): i test con `@TempDir`
  restano isolati.
- Il wizard continua a permettere la scelta della cartella e propone la nuova root come
  default; il percorso scelto (pointer `~/.securelocalshare_root`) ha sempre la precedenza.

---

## [4.8.0] — 2026-07-12

Inversione della semantica dei dati in sblocco/ripristino e tracciamento server-side
del blocco al momento in cui scatta (task "Semantica dati lock/unlock + report Supabase").

### `desktop` — sblocco che conserva i dati, ripristino master password distruttivo

- **`unlock.lks` ora CONSERVA i dati** (ENV_LOCK e PERMANENT_LOCK). Il flusso di
  `LockInfoFrame.handleUnlockFile` non azzera più il vault: dopo la verifica del file
  (firma Ed25519 + hardware ID + scadenza + nonce, senza side-effect via il nuovo
  `UnlockService.validate`), chiede la **master password attuale** e una **nuova** e
  richiama `VaultService.rotatePassword` per ri-avvolgere la DEK invariata. Solo dopo una
  rotazione riuscita l'unlock viene committato (`UnlockService.apply`: lock azzerato, nonce
  consumato, `lock.lks` archiviato) e l'app riparte alla normale schermata di login.
- **Ripristino ENV_LOCK con master password ora è DISTRUTTIVO.** `doRecover` verifica la
  password (prova di proprietà), poi — previa conferma esplicita — azzera vault e dati
  (`wipeAllData`) e richiede una nuova master password al riavvio. È la via gratuita; la via
  che conserva i dati è l'`unlock.lks` a pagamento (coerenza con il modello di monetizzazione).
- **`UnlockService.validate(Path)`**: nuova validazione senza side-effect (non consuma il
  nonce, non azzera il lock), così la password di rotazione è richiesta prima del commit.
- Nuovo dialog di rotazione (password attuale + nuova ×2, minimo 8 caratteri) con azzeramento
  dei `char[]` in RAM. Aggiornate tutte le copy/dialoghi di `LockInfoFrame`.
- Bump versione app a **4.8.0** (`pom.xml`, `AppVersion.FALLBACK`).

### `desktop` — tracciamento Supabase del blocco al momento del lock

- **`SignInFrame`**: al 10° tentativo (PERMANENT_LOCK) il blocco viene segnalato **subito**
  a Supabase (`report_lock`), non più solo al riavvio successivo. Prima nessun record veniva
  scritto se l'utente sbloccava/non riavviava.
- **`LockReporter.report(...)`**: nuovo overload con `client_event_id` esplicito; usa il
  `lockNonce` attivo come id stabile → l'evento a lock-time e quello all'avvio successivo
  confluiscono in un unico record (idempotenza tra riavvii, dedup anche in coda locale).
  `Main.java` allineato per usare lo stesso id stabile.

### `desktop` — privacy dei log e rifiniture UI

- **`LogSanitizer`** (nuovo): la console log del `ManagerFrame` censura i dati sensibili
  (URL del database, chiavi `sb_*`, token Bearer, email, path assoluti, `hwid`, nonce)
  mantenendo intatti il tipo di errore e il resto del messaggio. I file di log su disco
  conservano il dettaglio completo per il debug. Applicato in `ManagerFrame.appendLog`.
- **`LockInfoFrame`**: descrizioni di header e colonne accorciate e larghezze dei `div` HTML
  ridotte (header 720→660, colonne 320→300) per evitare il testo tagliato a destra nel frame
  statico 880×660.

### `desktop` — coda blocchi protetta e auto-sblocco

- **Coda blocchi anti-manomissione**: `lock_queue.json` è ora un envelope firmato HMAC-SHA256
  con chiave legata all'HWID (`{events_b64, sig}`): una modifica manuale invalida la firma e la
  coda viene ignorata. Quando tutti gli eventi sono accettati dal server il file viene
  **cancellato** (niente code vuote residue). Il vecchio formato "array nudo" è migrato una tantum.
- **Download automatico dell'unlock** (`DeviceUnlockFetcher`): all'apertura, se il dispositivo è
  bloccato, la DesktopApp interroga l'Edge Function `device-unlock` (auth device: `hwid` +
  `activation_token`); se l'autore ha già caricato l'`unlock.lks`, lo scarica da un link firmato,
  lo **verifica** (`UnlockService.validate`) e lo pre-carica nel `LockInfoFrame` — l'utente deve
  solo completare con master password attuale + nuova. Best-effort, non blocca l'avvio.

### `webplatform` — evasione lock e auto-consegna

- **`AccountingTab` → "Sblocchi LOCK da evadere"**: la vista ora elenca anche i blocchi non
  risolti da `lock_events` (prima mostrava solo gli ordini LOCK pagati). Per ogni dispositivo
  bloccato mostra HWID/email/tipo/data; l'upload dell'`unlock.lks` resta legato all'ordine pagato
  corrispondente, mentre i blocchi senza ordine appaiono come "In attesa di pagamento".
- **Edge Function `device-unlock`** (nuova, `--no-verify-jwt`): recapita al dispositivo legittimo
  un link firmato all'unlock caricato dall'admin. Aggiunta a `functions:deploy` e alla guida.

### `webplatform` / `docs`

- **`supabase/functions/GUIDA_DEPLOY.md`**: l'elenco manuale (SQL Editor) delle migration
  ora include 0017–0020; evidenziato che **senza 0019 + 0020** la RPC `report_lock` risponde
  404 e i blocchi restano in `lock_queue.json` senza comparire in `lock_events`.

### `webplatform` — copy allineata al nuovo modello

- **`Sicurezza.tsx`**: ENV_LOCK ora descrive le due vie (master password gratuita ma
  distruttiva / `unlock.lks` che conserva i dati con password attuale + nuova);
  PERMANENT_LOCK evidenzia che l'`unlock.lks` conserva i dati. Aggiornata la lista dei flussi.
- **`Faq.tsx`**: risposta PERMANENT_LOCK precisata (dati intatti, richiesta password attuale
  + nuova). `Pricing.tsx`/`Checkout.tsx` già coerenti (lo sblocco pagato conserva i dati).

---

## [4.7.0] — 2026-07-11

WebPlatform — miglioramento responsività mobile, fiducia percepita e SEO/condivisibilità
(task "SEO WebPlatform").

### `webplatform` — Fase 1: fix critici UX

- **Menu mobile**: la `Navbar` collassa in un **menu hamburger** accessibile (toggle
  `aria-expanded`, chiusura con `Esc`, pannello a comparsa) sotto il breakpoint `md`. Risolto
  l'overlap tra logo e voci di menu su viewport mobile.
- **Recensioni nascoste**: voce rimossa (commentata) dai menu e dal footer; la pagina
  `/recensioni` mostra un **placeholder neutro** ("Presto le prime recensioni…") tramite flag
  `SHOW_REVIEWS`. Nessun contenuto cancellato; rimossa dalla vista la recensione autoprodotta.
- **Pricing**: copy rassicurante **prima** delle cifre ENV_LOCK/PERMANENT_LOCK (il vault e i dati
  restano intatti, il blocco è anti-bruteforce) con richiamo a `/sicurezza#tipi-di-blocco`.

### `webplatform` — Fase 2: SEO tecnico

- Nuovo hook **`useSeo`** (`src/lib/seo.ts`): `title`, `meta description`, `canonical`, Open Graph
  e Twitter Card **unici per pagina** (home, funzionalità, sicurezza, prezzi, recensioni, chi sono, FAQ).
- Default OG/Twitter e **JSON-LD `SoftwareApplication`** (con i tre piani/offerte) in `index.html`.
- **`robots.txt`** statico (pagine pubbliche indicizzabili, aree app/auth escluse) e **`sitemap.xml`** reali.

### `webplatform` — Fase 3: contenuti

- **Hero home** riscritto sul posizionamento "l'alternativa a 1Password + Google Drive che resta in
  casa tua"; ridotto il gergo tecnico (PBKDF2/iterazioni spostati su Sicurezza).
- Nuova pagina **FAQ** (`/faq`) con markup **JSON-LD `FAQPage`**: PC spento, accesso da fuori casa,
  master password dimenticata, PERMANENT_LOCK, prezzi, crittografia.
- Placeholder **prova sociale** commentato in home (TODO: numeri reali).
- Segnalata l'incoerenza "codice aperto" senza repo GitHub pubblico (nessun link rotto aggiunto).

### Note / TODO aperti

- Immagine social dedicata **1200×630** (attuale fallback: `/icon-512.png`).
- Numeri reali di prova sociale (utenti/download/stelle) da inserire.
- Decisione su repository open source pubblico o riformulazione della dicitura "codice aperto".

---

## [4.6.1] — 2026-07-05

Rifiniture e hardening di sicurezza dei blocchi (dai commenti sul task).

### `webplatform`

- **Pricing**: nuovo pulsante **"?"** che porta a `/sicurezza#tipi-di-blocco` (spiegazione ENV_LOCK /
  PERMANENT_LOCK). Aggiunta l'ancora e lo scroll all'hash nella pagina Sicurezza.

### `desktop` — frame di blocco più chiaro

- `LockInfoFrame`: finestra ingrandita e testi non più troncati; **chiarito** che la **master
  password ripristina senza perdere i dati**, mentre l'**unlock.lks dell'autore azzera tutto**.
- Aggiunta una **conferma esplicita** prima del reset distruttivo con unlock.lks.

### `desktop` / `db` — integrità estesa e tracciamento blocchi

- **Firma di integrità estesa** (`EnvironmentStore`): oltre ai campi di lock ora copre anche
  `planType`, `billingCycle`, `renewalEstimate`, `activationToken`, `activationEmail`. Modificarli a
  mano → manomissione → blocco. Migrazione **re-firma silenziosa una-tantum** dei file pre-aggiornamento
  (nessuno viene bloccato all'update). Il Tool-CLI non è impattato (lavora su `lock.lks`, non sulla firma).
- **Tracciamento server-side dei blocchi** — migration `0019` (`lock_events` + RPC `report_lock`,
  `active_lock_type`, `resolve_locks`). Nuovo `LockReporter` (DesktopApp): al blocco registra un evento
  su Supabase; se **offline** lo **accoda** e lo **risincronizza** alla riconnessione (idempotente).
  All'avvio, se il server ha un blocco attivo per l'HWID ma il file locale è stato ripristinato, l'app
  si **ri-blocca**. Lo sblocco valido chiama `resolve_locks`.
- **Fix `report_lock`** (`0020`): `occurred_at` passato come **text** e castato lato DB (PostgREST poteva
  rifiutare la firma con parametro `timestamptz`). `LockReporter` ora **logga il corpo della risposta**
  su errore, per diagnosticare rapidamente eventuali fallimenti di sincronizzazione.

### Versioning

- Allineamento a **4.6.1** su tutte le componenti.

---

## [4.6.0] — 2026-07-05

Setup completo dei flussi di pagamento: abbonamenti **ricorrenti**, **rinnovo assistito**, acquisto
**LOCK** dalla WebPlatform con consegna del file di sblocco, storico ordini lato admin e utente.

### `db` — migration `0018`

- `orders`: aggiunti `hwid` (sblocchi LOCK), `provider_subscription_id`, `is_recurring`.
- `subscriptions`: `provider_subscription_id`, `auto_renew`, `cancel_at_period_end`.
- Nuova tabella `unlock_files` + bucket storage privato **`unlocks`** (admin scrive, utente legge i
  propri via signed URL). RPC `mark_unlock_downloaded`.

### Edge Functions

- **create-checkout**: HWID sugli ordini LOCK; abbonamento **ricorrente reale** via Stripe
  `mode=subscription` (rinnovo/addebito automatico). Flag `recurring` dal client.
- **stripe-webhook**: gestione ciclo di vita — `invoice.paid` (rinnovo → estende il periodo e
  registra un ordine di rinnovo), `customer.subscription.deleted` (stop rinnovo).
- **send-unlock-email** (nuova, solo admin): genera un link firmato al file di sblocco e lo invia
  all'utente via **Resend** (fallback: ritorna il link se l'email non è configurata). Le Edge
  Functions **non generano mai** l'unlock.lks: lo produce l'autore col Tool-CLI e lo carica.
- PayPal ricorrente non nativo: coperto dal **rinnovo assistito**.

### `webplatform`

- **/admin/contabilita**: **storico ordini** (tutti) + **gestione sblocchi LOCK** (upload di
  unlock.lks su storage con HWID, invio email all'utente).
- **Dashboard utente**: sezione **"I miei ordini e pagamenti"** con download del file di sblocco;
  card piano con **data di rinnovo** e pulsante **Rinnova ora**.
- **Checkout**: campo HWID per gli sblocchi LOCK e toggle **rinnovo automatico** per gli abbonamenti.

### `desktop`

- **Rinnovo assistito**: alla scadenza (online, appena il server declassa; oppure offline in
  scadenza) l'app propone di **pagare la nuova bolletta** aprendo la WebPlatform (`PlanRenewal` +
  `PlanRenewalPrompt`, chiamati da `Main`).
- **Schermata di blocco** (`LockInfoFrame`): nuovo pulsante **"Paga lo sblocco online"** che apre il
  checkout della WebPlatform con l'HWID del dispositivo.

### Versioning

- Allineamento a **4.6.0** su tutte le componenti.

---

## [4.5.0] — 2026-07-05

### `desktop` / `webapp` — decompressione in-app di archivi RAR e 7z

- **DesktopApp**: la decompressione in-app (`FileService.extractArchive`, endpoint
  `POST /api/files/{id}/extract`) ora supporta anche i payload **RAR** (`.lksrar`) e **7z**
  (`.lks7z`), oltre allo ZIP già esistente. Prima gli archivi non-ZIP venivano rifiutati con
  `ARCHIVE_FORMAT` e andavano scaricati ed estratti manualmente.
- **Nuova classe `ArchiveExtractors`**: isola le librerie di estrazione dietro un
  `EntryConsumer` condiviso, così la ricostruzione dell'albero cartelle in
  `FileService.importArchive` resta identica per tutti i formati. ZIP via JDK, **RAR via
  [junrar](https://github.com/junrar/junrar)**, **7z via
  [7-Zip-JBinding](https://sevenzipjbinding.sourceforge.net/)** (native bundle
  `-all-platforms`, nessuna dipendenza di sistema).
- **`FileService.importArchive`** rifattorizzato con overload `(userId, name, format, bytes,
  parentId)` che instrada per formato; l'API a 4 parametri resta invariata (default ZIP).
- **WebApp**: il pulsante **Decomprimi** sulle card archivio è ora visibile anche per `.lksrar`
  e `.lks7z` (`canExtract` esteso a `zip`/`rar`/`7z`).
- **Dipendenze** (`pom.xml`): aggiunte `com.github.junrar:junrar:7.5.5`,
  `net.sf.sevenzipjbinding:sevenzipjbinding:16.02-2.01` e
  `sevenzipjbinding-all-platforms:16.02-2.01`.
- **Note**: junrar copre il formato RAR4 (RAR5/archivi cifrati → `ARCHIVE_INVALID`); il motore
  7z nativo viene inizializzato una sola volta (lazy, thread-safe).
- Bump versione **4.4.3 → 4.5.0** (`pom.xml`, `AppVersion`, `package.json`).

### `db` / `desktop` — abbonamento in environment.lks e scadenza con declassamento

- **Migration `0017` (subscription expiry)**: le RPC `bind_activation` e `validate_license` ora
  restituiscono il piano **effettivo** e i campi `billingCycle` (mensile/annuale) e `renewalEstimate`
  (data rinnovo) letti da `public.subscriptions` — prima erano hardcoded a `null`, perciò
  `environment.lks` non li aggiornava mai. Nuovo helper `effective_plan_info(email)`.
- **Scadenza automatica**: se l'abbonamento è scaduto (`current_period_end < now`), l'utente viene
  **declassato a Free** (`registrations.plan` → `free`, subscription → `expired`, idempotente); al
  successivo avvio online l'app riceve `free` e blocca le funzionalità a pagamento.
- **Blocco offline** (`PlanTier.ofEnvironment`): il Desktop calcola il tier **effettivo** anche
  offline — se il piano è a pagamento ma `renewalEstimate` è passato (oltre 1 giorno di tolleranza),
  degrada a Free. Usato da `PlanGateFilter`, `PlanService` e `SystemService`.
- Nota: `billingCycle`/`renewalEstimate` si aggiornano in `environment.lks` al **prossimo avvio**
  dell'app (unica chiamata a Supabase all'avvio).

---

## [4.4.3] — 2026-07-04

### `webapp` / `desktop` — blocco creazione utenti oltre il limite di piano

- **UserPicker (landing WebApp)**: il bottone **"Nuovo Utente"** mostra una **mini-card con il piano**
  attivo e il conteggio utenti (`Piano Free · 3/3`). Se il limite è raggiunto il bottone è
  **disabilitato**, non apre la registrazione e mostra la **targhetta del piano necessario**
  (ESSENTIAL/PRO) come copertura, per indicare cosa serve per aggiungere altri utenti.
- **Pagina `/register`**: banner di avviso e **submit bloccato** quando il limite utenti è raggiunto
  (copre anche l'accesso diretto dal link "Registrati").
- **Backend**: nuovo endpoint pubblico `GET /api/auth/register-info`
  (`UserService.registerInfo`) che espone piano, limite utenti, conteggio e disponibilità, così la
  UI può bloccare la creazione prima dell'invio. L'enforcement autoritativo resta in
  `UserService.register` (402 PLAN_LIMIT).

### `desktop` — test allineati ai nuovi limiti

- Aggiornati `ServiceLayerTest` e `ConcurrentMultiUserTest`: i service ora ricevono un
  `PlanService` (piano **pro** in test, così i test esistenti non urtano i limiti). Aggiunto
  `userLimitEnforcedOnFreePlan` che verifica il blocco del 4° utente sul piano free.

### Versioning

- Allineamento a **4.4.3** su tutte le componenti.

---

## [4.4.2] — 2026-07-04

### `webapp` / `desktop` — cancellazione account

- **Impostazioni → Sicurezza**: nuova sezione **"Elimina account"** che consente all'utente di
  cancellare definitivamente il proprio account, previa conferma con la password e modale di
  conferma. Al termine viene eseguito il logout.
- **Backend** (`UserService.deleteAccount`, endpoint `DELETE /api/users/me`): rimozione a cascata
  di **tutti i dati legati all'utente** — credenziali, file LocalDrop (inclusi i blob cifrati su
  disco), cartelle e categorie di proprietà — e rimozione dell'utente dalle condivisioni altrui.
  Operazione irreversibile, protetta da verifica password (Argon2).

### Versioning

- Allineamento a **4.4.2** su tutte le componenti.

---

## [4.4.1] — 2026-07-04

Rifiniture e correzioni sulla funzionalità Piani/Pagamenti (task ClickUp `869dumz9h`),
più due documenti di supporto.

### `webplatform`

- **Pricing**: gli sconti a tempo attivi ora aggiornano il prezzo mostrato nelle card
  (prezzo di listino barrato + badge sconto); il tab di default è **Mensile**.
- `.env.example` aggiornato e nuovo `supabase/functions/.env.example` con le variabili di
  Stripe/PayPal/Supabase.

### `webapp`

- **Modale di conferma** riutilizzabile (`ConfirmProvider`/`useConfirm`) al posto di
  `window.confirm`/alert del browser (eliminazioni, gating piano).
- **Notifiche cliccabili**: al click si apre la credenziale o il documento collegato
  (`?open=<id>` su Dashboard/LocalDrop). Il `NotificationDto` porta ora `resourceId`.
- **Credenziali**: in modifica i campi **password e secret** sono offuscati finché non si
  clicca il campo o l'icona occhio; i **campi personalizzati** sono spostati **sopra le note**.
- **Limiti di piano** con messaggi di upgrade: max cartelle (Free 3), max campi personalizzati
  per categoria (Free 2 · Essential 4 · Pro 8), targhette e blocchi già presenti.

### `desktop` / `api`

- Nuovo **`PlanService`** (legge il piano da `environment.lks`) e enforcement autoritativo dei
  limiti: **cartelle** (`FolderService`), **utenti** (`UserService.register`) e **campi
  personalizzati** per categoria (`CategoryService`), con errore **402 PLAN_LIMIT**.
- `PlanCatalog.maxCustomFields` (2/4/8) e `SystemStatusDto.planMaxCustomFields` per il gating UI.
- `NotificationDto`/`ShareReceivedEvent` estesi con `resourceId` per l'apertura diretta.

### Documentazione

- **Setup_Pagamenti_SecureLocalShare.docx**: guida passo-passo per configurare Stripe, PayPal e
  le Supabase Edge Functions (secret, webhook, deploy, test, troubleshooting).
- **Contratto_e_Termini_SecureLocalShare.docx**: contratto d'acquisto e Termini e Condizioni.

### Versioning

- Allineamento a **4.4.1** su tutte le componenti.

---

## [4.4.0] — 2026-07-04

Avvio della funzionalità **Piani & Abbonamenti** (task ClickUp "Implementazione Pagamento",
`869dumz9h`). Questa entry copre la **Fase 1**: modello dati dei piani e **gating delle
funzionalità** su tutte le app, con report del piano e proposta di redirect alla WebPlatform.
La **Fase 2** (checkout, pagamenti Stripe/PayPal via Edge Functions, sconti a tempo, card
Contabilità in `/admin`, acquisto LOCK) è ora implementata — vedi sotto. Resta da fare solo la
suddivisione delle segnalazioni per piano in `/admin/segnalazioni`.

### `webplatform` / `db` — modello piani e pagina prezzi

- **Migration `0015_v440_plans.sql`**: nuove tabelle `plans` (Free/Essential/Pro con prezzi in
  centesimi, limiti `max_users`/`max_folders`/`max_upload_bytes` e prezzi scontati dei LOCK) e
  `plan_features` (matrice *feature → piano minimo*, base di gating e targhette). `registrations.plan`
  è ora vincolato via FK a `plans(code)`. RPC pubblica `get_plans_catalog()` (catalogo per pricing e
  app) e RPC admin `admin_plan_accounting()` (conteggi utenti per piano, per la futura card
  Contabilità). RLS: catalogo in sola lettura pubblica, scrittura solo `service_role`.
- **Pagina `/pricing`** (`src/pages/Pricing.tsx`) con 3 card (toggle mensile/annuale, piano
  Essential "consigliato") e tabella degli sconti sui LOCK. Nuova voce **"Prezzi"** nell'header di
  tutte le pagine landing e nel footer; alias `/prezzi` → `/pricing`.
- **`src/lib/plans.ts`**: single source of truth lato frontend (allineata al seed della migration),
  con helper di confronto piani, targhette e formattazione prezzi.

### `desktop` / `api` — dizionario endpoint→piano e gate a pagamento

- **`PlanCatalog`** (`api/plan`): la "pagina unica" richiesta dal task in cui decidere quali endpoint
  sono a pagamento e quale piano minimo li sblocca (`RULES`), più i limiti quantitativi per piano
  (`maxUsers`/`maxFolders`). Endpoint non elencati = gratuiti. `PlanTier` modella i livelli con
  confronto per rank.
- **`PlanGateFilter`** (registrato in `ApiConfig`, ordine 2 dopo il `JwtFilter`): per ogni richiesta
  confronta il piano di `environment.lks` con la regola dell'endpoint; se insufficiente risponde
  **402 PLAN_REQUIRED** con corpo JSON (`feature`, `requiredPlan`, `currentPlan`, `upgradePath`).
  Nessuna chiamata di rete: funziona identico anche **offline**. Il mirror del piano all'avvio (unica
  chiamata a Supabase → `environment.lks`, con fallback offline) era già presente in `Main.java`.
- **Endpoint gated iniziali**: condivisione file e import archivi zip/rar (Essential); compressione e
  decompressione cartelle (PRO). `/api/system/status` espone ora `planMaxUsers` e `planMaxFolders`.

### `webapp` — targhette, limiti e gestione del 402

- **`src/utils/plans.ts` + `src/hooks/usePlan.ts` + `src/components/PlanBadge.tsx`**: infrastruttura
  di gating lato UI (matrice feature, targhette ESSENTIAL/PRO, limiti utenti/cartelle). Costante
  `PLATFORM_URL` per il redirect all'upgrade.
- **Gestione globale del 402 `PLAN_REQUIRED`** in `service/api.ts` (fetch, upload semplice e upload
  con progress): un handler in `AuthContext` mostra il **report del piano** e **propone il redirect**
  alla WebPlatform `/pricing`.
- **Esempio applicato**: nella creazione categorie il tipo "Documenti" mostra la targhetta
  **ESSENTIAL** e ne blocca la selezione per i piani che non lo includono.

### `webapp` — correzioni gating e UX (round 2)

- **Targhetta piano come copertura sovrapposta**: `PlanBadge` è ora posizionata in modo assoluto
  (overlay d'angolo) e non altera più il layout. Applicata via `GatedIconBtn` a condivisione file
  (ESSENTIAL) e compressione/decompressione cartelle (PRO): se il piano non le include, mostra il
  report del piano invece di eseguire l'azione.
- **Blocco archivi in upload**: zip/rar/7z ecc. non sono caricabili se il piano non include
  `localdrop_archive_load` (ESSENTIAL), sia da AddModal che da drag&drop; nel modale è indicato il
  **peso massimo per file** del piano attuale.
- **Piano nella status bar**: la barra di stato mostra il piano attivo dell'utente.

### `webplatform` — dashboard, contabilità e checkout

- **Dashboard**: card "Il tuo piano" con piano attivo, prezzo, highlight e bottone di upgrade → `/pricing`.
- **`/admin` → tab Contabilità**: utenti per piano (RPC `admin_plan_accounting`), ripartizione,
  conversione, stima MRR/ARR, ordini pagati e incassato (RPC `admin_orders_summary`) e **gestione
  degli sconti a tempo** (creazione/attivazione).
- **Checkout completo** (`/checkout`, `/checkout/result`, `/checkout/simulate`): acquisto di
  abbonamenti (piani, mensile/annuale) **e** LOCK (ENV/PERM), con scelta provider Stripe/PayPal e
  applicazione automatica degli sconti a tempo. Prezzo calcolato **server-side**.

### `db` / Edge Functions — ordini, abbonamenti, pagamenti

- **Migration `0016_v440_checkout.sql`**: tabelle `discounts` (sconti a tempo), `orders` (ordini
  piano/LOCK con stato pagamento) e `subscriptions` (abbonamento corrente). RPC `get_active_discounts`
  (pubblica) e `admin_orders_summary` (admin). RLS: ordini/abbonamenti visibili solo al proprietario.
- **Supabase Edge Functions** (`supabase/functions/`): `create-checkout` (prezzo server-side +
  Stripe Checkout/PayPal, con **fallback simulato** se le chiavi non sono configurate),
  `simulate-payment`, `stripe-webhook` (verifica firma) e `paypal-webhook`. La finalizzazione
  dell'ordine aggiorna `registrations.plan` e l'abbonamento. Config e deploy in
  `supabase/functions/README.md`.

### Versioning

- Numero di versione allineato a **4.4.0** su tutte le componenti: `Web Platform/package.json`,
  `Web App/package.json`, `Costant.VERSION` (WebApp), `DesktopApp/pom.xml` e `AppVersion.FALLBACK`.

---

## [4.3.9] — 2026-07-02

Barra di progresso per gli upload del LocalDrop e limiti di caricamento dinamici in base al piano
della licenza. Da task ClickUp "Progress Bar per limiti di upload (v4.3.9)", scope `desktop` +
`api` + `webapp`. L'upload dei file passa da un modello interamente in memoria (di fatto limitato a
~2 GB per il tetto degli array Java) a una **pipeline in streaming end-to-end**, così i file possono
raggiungere i limiti di piano (fino a 20 GB) su heap costante.

### `desktop` / `api` — streaming, limiti per tier e controllo spazio

- **Cifratura in streaming dei blob LocalDrop**: nuovi `CryptoUtils.encryptStream` /
  `decryptStream` (AES-256-GCM a chunk da 64 KiB) e helper atomici `StoreSupport.encStreamToFile` /
  `decStreamToOut`. Il layout su disco resta identico (`IV(12) || ciphertext || tag(16)`), quindi i
  blob esistenti restano leggibili e i nuovi blob sono interscambiabili con il percorso ad array.
  **Nessun impatto** su vault `.lks`, protocollo di lock/unlock o Tool-CLI: le primitive
  `encrypt`/`decrypt` esistenti non sono state toccate e la cifratura cambia *solo* per i documenti
  del LocalDrop.
- **Upload in streaming**: `FileController` inoltra `MultipartFile#getInputStream()` a
  `FileService.uploadStream`, che cifra direttamente sul blob senza materializzare il file in un
  `byte[]`. `spring.servlet.multipart.file-size-threshold=0` fa spillare le parti su file temporaneo.
- **Download in streaming**: l'endpoint restituisce uno `StreamingResponseBody` che decifra e invia
  i byte progressivamente (niente più `ByteArrayResource`), con verifica del tag GCM a fine stream.
- **Limiti dinamici per piano** (`UploadProperties`, prefisso `localdrop.upload.*` in
  `application.properties`): Gratuito 5 GB, Essential 10 GB, PRO 20 GB. Il tetto del layer multipart
  è impostato **dinamicamente in base al `planType`** di `environment.lks` all'avvio del backend
  (`MultipartConfig`); l'enforcement autoritativo e localizzato è in `FileService`. Finché il modello
  di pagamento (v4.4.0) non esiste, ogni installazione resta `free` ma il meccanismo è già cablato.
- **Controllo spazio su HOST**: prima di accettare un file ≥ 1 GB il servizio verifica lo spazio
  libero del volume di storage e risponde `507 INSUFFICIENT_SPACE` con messaggio dedicato se non
  sufficiente. `GlobalExceptionHandler` mappa anche `MaxUploadSizeExceededException` → `FILE_TOO_LARGE`.
- **Proxy LAN**: `LanFrontendServer` ora inoltra il body della richiesta in streaming
  (`BodyPublishers.ofInputStream`) invece di bufferizzarlo, condizione necessaria perché gli upload
  multi-GB attraversino il reverse-proxy 9505→9507 senza OOM.
- `/api/system/status` espone `planType`, `maxUploadBytes` e `uploadProgressThresholdBytes`.

### `webapp` — progresso, navigazione durante l'upload e limiti

- **Upload con progresso reale** via `XMLHttpRequest` (`uploadFileWithProgress`): `fetch` non
  espone il progresso di upload.
- **`UploadContext` globale**: gestisce l'upload di grandi dimensioni fuori dal ciclo di vita della
  pagina, così l'utente può **navigare la WebApp** mentre il file termina; una **barra di progresso
  persistente** (`UploadDock`, montata in `AppShell`) resta visibile tra i cambi di pagina e permette
  di annullare. Durante un upload > 1.5 GB gli altri caricamenti sono **bloccati** finché non termina.
- **`LocalDrop`**: i limiti (max per piano, soglia 1.5 GB) arrivano da `/api/system/status`; i file
  oltre soglia sono instradati nel manager globale con progresso, quelli oltre il limite di piano
  sono rifiutati con messaggio dedicato (es. «supera il limite del piano Gratuito (5 GB)»); la lista
  si aggiorna al completamento anche di un upload in background.

---

## [4.3.7] — 2026-06-28

Campi personalizzati per le categorie di tipo Credenziali. Da task ClickUp "Campi personalizzati per
Categoria Credenziali v4.3.7", scope `desktop` + `api` + `webapp` + `webplatform`. Ogni categoria
credenziali può ora definire fino a **4 campi personalizzati** (anche dello stesso tipo) che le sue
credenziali ereditano. Il precedente meccanismo a "tipologia password" (`password-types.json` /
`PasswordTypeRegistry`) è stato **rimosso** e sostituito da questo modello.

### `desktop` — modello, validazione e notifiche

- Nuova entità `CustomFieldEntity` sulle categorie (`TESTUALE`, `NUMERICO`, `SCADENZA`, `SECRET`;
  `maxLunghezza` per il testo, default 30; `condivisibile` per i secret). Massimo 4 per categoria,
  validati lato `CategoryService`.
- `CredentialEntity`: rimosso `tipologia`; i `campi` ora contengono i **valori** dei campi della
  categoria (snapshot di nome/tipo). I valori `SECRET` sono cifrati AES-256-GCM come la password e
  nascosti nelle liste; gli altri sono in chiaro nel file (già cifrato) e validati per tipo.
- Reveal arricchito: oltre alla password restituisce i campi `SECRET` visibili al richiedente
  (il proprietario li vede tutti; un destinatario di condivisione solo quelli `condivisibile`).
- **Notifiche di scadenza** via SSE: nuovo `NotificationType.PASSWORD_EXPIRING` e
  `ExpiryNotificationService`, che alla connessione dello stream notifica le credenziali con un campo
  `SCADENZA` entro 10 giorni (throttling in RAM per evitare duplicati alle riconnessioni).
- Rimossi `PasswordTypeRegistry`, `PasswordTypeController`, `password-types.json` e `PasswordTypeDto`.
- `DataStore`: deserializzazione tollerante ai campi sconosciuti (`FAIL_ON_UNKNOWN_PROPERTIES=false`),
  così i vault esistenti con il vecchio `tipologia` continuano a caricarsi.

### `webapp` — definizione, compilazione e scadenze

- Editor categorie (`Categories.tsx`): aggiunta/rimozione di max 4 campi con configurazione per tipo
  (max caratteri per il testo, flag *condivisibile* per i secret).
- Form credenziale (`PasswordForm.tsx`): rende dinamicamente i campi della categoria selezionata
  (testo con `maxLength`, numero, data, secret oscurato) e li invia al salvataggio.
- Dashboard: banner di scadenza in alto a destra nella card con icona di allerta — **rosso 0–10 gg,
  giallo 11–30 gg** — filtro **In scadenza** (0–30 gg) e, per le credenziali scadute, **mini-scheda
  rossa «Credenziale scaduta»**.
- Scheda di dettaglio (`CredentialViewModal`): mostra i campi personalizzati; i secret non
  condivisibili restano oscurati per i destinatari.
- Notifiche: gestito il tipo `PASSWORD_EXPIRING` (copy, icona, pannello).

### `webplatform` — documentazione

- Migration `0014_v437_docs_custom_fields.sql`: nuova sezione della pagina /docs (CMS) sui campi
  personalizzati delle categorie e sul comportamento delle scadenze (inserimento idempotente).
- Pagina Funzionalità aggiornata: il blocco "Password manager completo" cita i campi personalizzati
  e gli avvisi di scadenza.

---

## [4.3.6] — 2026-06-28

Gestione Licenze & Security: messo a punto il flusso di una chiave di licenza tra WebPlatform e DesktopApp.
Da task ClickUp "Gestione Licenze & Security v4.3.6", scope `desktop` + `webplatform` + `api` (Supabase).
Introdotto lo stato **`revoked`** bloccante, lo scaffolding del piano in `environment.lks`, il binding
dell'`hardware_id` lato registrazione e la correzione del banner d'errore in fase di creazione master password.

### `api` (Supabase) — migration `0013`

- **Nuovo stato `revoked`** nel CHECK di `activations.status` (`pending | active | revoked | suspended`).
- `revoke_activation(p_id)` ora porta lo stato a **`revoked`** (revoca *bloccante*) mantenendo `hwid`/token,
  così la DesktopApp che fa il controllo pre-login rileva la revoca e si blocca. (Prima riportava a `pending`
  rigenerando il token.) La riattivazione avviene generando una nuova attivazione (nuovo token).
- `bind_activation(...)` lega l'HWID **solo in `activations.hwid`** (la colonna `registrations.hardware_id` è
  stata rimossa dallo schema) e restituisce il **piano** (`plan`, scaffolding `free`; `billingCycle`/`renewalEstimate`
  null finché non esiste un modello di abbonamento). Una licenza `revoked` non è ri-bindabile.
- `validate_license(...)` accetta `p_app_version` (sync della versione attiva dopo un aggiornamento) e
  restituisce `status` (incl. `revoked`) e `plan`.

### `desktop` — gate licenza & stato revoked

- **Controllo licenza pre-login**: in `Main` il gate Supabase gira prima di qualsiasi UI di accesso. Se la
  licenza è `revoked` l'app apre la nuova **`RevokedLicenseFrame`** (blocco totale) *prima* del login; offline o
  Supabase non configurato → tollerato (l'app prosegue col piano locale in `environment.lks`).
- **`RevokedLicenseFrame`**: spiega la revoca e offre la **disinstallazione con wipe irreversibile** di tutti i
  dati locali (vault, utenti, password, storage, configurazione), avvisando che non sono recuperabili.
- **Riattivazione dalla schermata di revoca**: nuovo pulsante "Riattiva licenza" che apre l'`ActivationDialog`;
  con un **nuovo codice** valido il device viene ribindato (`bind_activation`) e l'app si riavvia. Il token
  revocato e quelli legati ad altre macchine vengono rifiutati lato server, quindi senza una licenza nuova e
  valida non è possibile riattivare. Aggiunto il caso `REVOKED` ai messaggi dell'`ActivationDialog`.
- Rifinitura testi della schermata di revoca: a capo espliciti per evitare il troncamento delle parole.
- **Diagnostica attivazione/licenza (logging pre-login)**: `ActivationService` ora logga la causa precisa
  di ogni fallimento — su risposta non-2xx registra **status HTTP + corpo** della risposta Supabase (dove sta
  il messaggio SQL/RLS), mentre su errore di trasporto registra il **tipo di eccezione** (timeout/DNS/connessione).
  Nuovo outcome **`SERVER_ERROR`** (server raggiunto ma risposta d'errore) distinto da `NETWORK_ERROR`
  (irraggiungibile), così il messaggio mostrato non è più il fuorviante "Impossibile contattare il server".
  Il **gate licenza pre-login** (`Main`) e la **riattivazione** (`RevokedLicenseFrame`) tracciano sempre l'esito
  nel log (`/log/app_<data>.log`), anche prima del login. `ManagerFrame` tollera `SERVER_ERROR` senza forzare la
  riattivazione per un problema transitorio.
- `ActivationService`: nuovo outcome **`REVOKED`**, parsing del piano (`Plan`), `applyPlan(...)` per
  rispecchiare il piano in `environment.lks`, e `validate(...)` con sync della versione.
- `EnvironmentData`: nuovi campi non-security `planType` (default `free`), `billingCycle`, `renewalEstimate`
  (scaffolding; non coperti dall'HMAC di lock, quindi liberamente aggiornabili).
- `ManagerFrame`/`WizardFrame`/`ActivationDialog`: il piano viene persistito all'attivazione e al refresh;
  `ManagerFrame` gestisce anche l'outcome `REVOKED` (difesa in profondità).

### `desktop` — fix layout (creazione master password)

- Corretto il **banner d'errore** che rompeva il layout quando si inseriscono due master password non
  coincidenti: la colonna dei contenuti ha ora larghezza fissa (`CONTENT_W`) e il `wrapWidth` del banner rientra
  in tale larghezza, così la comparsa del banner non ridimensiona più la schermata.

### `webplatform` — card attivazione

- Stato **`revoked`** gestito nella `ActivationCard` (label + colore destructive) e nei tipi `database.types`.
- Riga dispositivo: **nome dispositivo** ("Dispositivo") con HWID come sottotitolo, icona **cestino** (`Trash2`)
  per la revoca mostrata solo sui dispositivi attivi; i dispositivi collegati restano visibili anche quando la
  licenza non è attiva (per la riattivazione con nuovo codice).
- Testi di revoca aggiornati alla nuova semantica *bloccante*.

---

## [4.3.5] — 2026-06-27

Migliorie al flusso di creazione e gestione delle segnalazioni (issue). Da task ClickUp "Migliorie Report
Issue v4.3.5", scope `desktop` + `webplatform`. Ridisegnato il frame delle segnalazioni della DesktopApp,
aggiunti gli allegati (screenshot) end-to-end e corretto un bug di fuso orario.

### `desktop` — frame Segnalazioni

- **Nuovo layout del form**: prima riga divisa in colonne (titolo 7/12, tipologia 5/12); seconda riga con
  area di testo a 10 righe scorrevole ma non espandibile e a capo automatico; terza riga con area di upload
  (stile `unlock.lks`) per allegare uno screenshot.
- **Tipologie**: `Implementazione, Bug, Altro` (sostituisce `Idea` con `Implementazione`).
- **Bottone "Apri segnalazione" ridimensionato** (font e padding più compatti).
- **Refresh automatico** della tabella delle segnalazioni ad ogni (ri)apertura della finestra.
- **Dialog di dettaglio**: doppio click su una riga apre un riepilogo della segnalazione (titolo, tipologia,
  stato, aperto il, documenti allegati, descrizione, note di lavorazione dell'autore).
- **Fix fuso orario**: l'orario di creazione viene convertito da UTC al fuso locale (risolve lo scarto di -2h).
- **Validazione allegato**: accettati solo **PNG/JPG/JPEG** fino a **5 MB**, con filtro nel selettore file, controllo su
  drag&drop e messaggio d'errore in caso di formato/dimensione non validi; `Content-Type` derivato dall'estensione.
- **Rifiniture grafiche**: rimossa l'icona del lucchetto dal campo *Titolo* (con padding interno leggermente
  aumentato, via `RoundField.withoutLeadingIcon()`); la select delle tipologie mostra ora le **stesse icone della
  WebPlatform** (Bug / Wrench / MessageSquare) con i relativi colori — aggiunte le icone vettoriali `BUG`, `WRENCH`,
  `MESSAGE` a `Icons`.

### `desktop` — `ReportService`

- `open(...)` ora restituisce l'id della segnalazione creata; nuovo `uploadAttachment(...)` che carica lo
  screenshot nel bucket `report-attachments` e lo registra via RPC `attach_report_file`.
- `listMine(...)` legge anche gli allegati (la RPC `list_my_reports` ora restituisce gli allegati per ogni
  segnalazione).
- **Fix upload allegato (HTTP 400 RLS)**: rimosso l'header `x-upsert` dall'upload su storage. Con l'upsert
  l'INSERT diventava `ON CONFLICT DO UPDATE`, che richiede anche una policy di UPDATE per il ruolo `anon`
  (assente) → RLS negava la scrittura. Il path contiene già un UUID univoco, quindi l'upsert era superfluo.

### `webplatform` — backend (migration `0012`)

- Tipologia segnalazioni: `idea` → `implementazione` (CHECK aggiornato + migrazione dei dati storici).
- Nuova tabella `report_attachments` + bucket storage privato `report-attachments` (insert anonimo, lettura
  solo admin) e RPC `attach_report_file`.
- `open_report` accetta `implementazione`; `list_my_reports` include gli allegati.
- Bucket `report-attachments` vincolato lato server a **`image/png`, `image/jpeg`** e **5 MB** (`file_size_limit` +
  `allowed_mime_types`), coerente con la validazione del client.

### `webplatform` — pannello admin

- **`/admin/segnalazioni`**: tipologia `Implementazione` (al posto di `Idea`) e sezione **Documenti allegati**
  con apertura degli screenshot tramite signed URL.

---

## [4.3.4] — 2026-06-27

Migliorie routing e contenuti della WebPlatform. Da task ClickUp "Migliorie Routing WP e WebPlatform
v4.3.4", scope `webplatform`. Rimossi i riferimenti al progetto come open source (prodotto reso privato),
aggiunte nuove pagine pubbliche, ristrutturato il pannello admin e arricchita la dashboard utente.

### `webplatform` — landing e pagine pubbliche

- **Rimozione "open source"**: eliminato ogni riferimento (hero, feature list, footer, Termini, meta
  description). Il prodotto è ora presentato come **privato/proprietario**; rimosso il link a GitHub.
- **Nuove pagine** collegate dall'header: `/chi-sono` (profilo autore con foto, biografia e card contatti,
  **editabile da admin** via Supabase), `/funzionalita` (showcase a righe alternate di DesktopApp e WebApp),
  `/sicurezza` (perché è sicuro, **cause/effetti dei blocchi ENV_LOCK e PERMANENT_LOCK**, tutti i flussi di
  blocco, elenco delle uniche richieste che usano Internet), `/recensioni` (recensioni raggruppate per versione).
- **Docs** (`/docs`): aggiunte le procedure passo-passo per risolvere ENV_LOCK (recupero con master password,
  che azzera le credenziali) e PERMANENT_LOCK (sblocco con `unlock.lks` firmato dall'autore).

### `webplatform` — pannello admin in 4 tab

- **`/admin/release`**: pubblicazione release + albero di versioning (firma Ed25519 + SHA-256).
- **`/admin/segnalazioni`**: gestione segnalazioni con **pulsante di reload** e **note dello sviluppatore**.
- **`/admin/docs-manager`**: gestione/anteprima documentazione (layout a blocchi) + **editor del profilo "Chi sono"**.
- **`/admin/analytics`** (sperimentale): KPI download per mese (grafico a linee), totali e stato segnalazioni
  (aperte / in lavorazione / chiuse).

### `webplatform` — dashboard utente

- **Changelog versioni** ad **altezza fissa con scroll** verticale.
- **Verifica licenza** all'accesso: se attiva, il token viene nascosto e si mostra la **lista dei device collegati**.
- **Card recensione**: l'utente inserisce versione, titolo e voto con **selettore a stelle (max 5)**.

### `webplatform` — database (migration `0010`)

- Tabella `author_profile` (singleton, contenuti `/chi-sono`), tabella `reviews` (voto 1..5 per versione),
  RPC `downloads_per_month()` (KPI admin), bucket pubblico `assets` per la foto profilo. RLS coerenti con
  `is_admin()` / `current_email()`.

---

## [4.3.3] — 2026-06-25

Gestione Archivio e Compressione del LocalDrop. Da task ClickUp "Gestione Archivio e Compressione
v4.3.3", scope `desktop` + `webapp`. Introdotto il modello **archivio reale `.lkszip`**: comprimere
una cartella ora produce un singolo contenitore ZIP cifrato che sostituisce la cartella e il suo
contenuto, sempre archiviato anche quando il risparmio è nullo.

### `desktop` — backend archivio/compressione

- **`POST /folders/{id}/compress` → archivio `.lkszip`**: `CompressionService.compressFolder` non
  agisce più in-place. Ora ricomprime i file per tipo (il risultato più piccolo vince, altrimenti
  bytes originali), li impacchetta in un unico ZIP che preserva i percorsi relativi, lo cifra e lo
  registra come singolo `MediaEntity` `<nome>.lkszip` (flag `archivio=true`) sotto la cartella
  genitore, quindi elimina la cartella originale e i relativi blob. L'archivio viene creato **anche
  se la dimensione non diminuisce** (fix: cartelle di video/PDF già compressi non sparivano più nel
  nulla).
- **Flag `archivio`** aggiunto a `MediaEntity` e a `FileDto`: niente più euristica per estensione
  lato frontend.
- **`POST /folders/import`** (nuovo): estrazione server-side di uno ZIP caricato in una nuova
  cartella + file, ricreando l'albero delle sottocartelle (cap a `MAX_DEPTH`, livelli più profondi
  appiattiti).
- **`POST /files/upload` — parametro `archivio`**: consente di caricare una cartella già compressa
  "così com'è", impostando il flag e normalizzando il nome.
- **Estensione archivio `.lks<ext>`**: l'upload "così com'è" preserva il formato originale
  (`zip→lkszip`, `rar→lksrar`, `7z→lks7z`, …) invece di forzare sempre `.lkszip`.
- **Download archivio "apribile"**: in download il prefisso `lks` viene rimosso dall'estensione
  (`foto.lksrar` → `foto.rar`), così l'archivio torna apribile con gli strumenti standard.
- **`POST /files/{id}/extract`** (nuovo): decomprime un archivio già presente ricreando cartella +
  file e rimuovendo l'archivio. In-app solo payload ZIP (`.lkszip`); per rar/7z l'utente scarica ed
  estrae manualmente.

### `webapp` — LocalDrop

- **Card "Archivio"** basata sul flag reale `archivio` con icona zip (`FolderArchive`, equivalente di
  `mdi-folder-zip-outline`); gli archivi sono mostrati solo nella card dedicata, non duplicati nelle
  liste cartelle/file.
- **Upload cartella intera** (`webkitdirectory`) con ricostruzione dell'albero; **upload file**
  diretto dall'header.
- **Upload di un archivio**: dialog con scelta *decomprimi e mostra come cartella* (estrazione
  backend, solo `.zip`) oppure *carica come archivio* (`.lks<ext>` che preserva il formato).
- **Decomprimi dalla card archivio**: pulsante *Decomprimi* sugli archivi `.lkszip` per estrarli in
  cartella; lo scarico riporta l'archivio al nome/estensione originale apribile.
- **Selezione multipla** dei file con barra azioni per cambio cartella padre e/o categoria in blocco.
- **Card della griglia (gr2) ad altezza fissa con scroll interno**: la pagina non cresce più
  all'infinito.
- **Mobile**: sotto i 640px i layout a griglia sono disattivati, l'archivio è consultabile solo come
  lista.

---

## [4.3.2] — 2026-06-23

Migliorie al Tool-CLI (uso autore). Da task ClickUp "Migliorie 4.3.2", scope `tool-cli`. La parte
Supabase (raggruppamento `registrations`/`activations`) è **rimandata** su richiesta. Formati
`LKS1.`/`ULK1.` e logica crittografica invariati.

### `tool-cli` — UI grafica Swing + copia unlock sul Desktop + keygen — *artifact v2.3.0*

- **Copia `unlock-<hwid>.lks` sul Desktop**: alla generazione, oltre a `output/unlock.lks`
  (+ `.sha256`), il token viene copiato sul Desktop con nome `unlock-<hwid>.lks` (hwid sanitizzato),
  così non va recuperato da `output/`. I due file canonici restano in `output/`.
- **UI grafica Swing** (avvio predefinito), che replica il wireframe "console" (tema scuro, accenti
  verdi, label monospace): dashboard con card `[01]–[06]` e viste di dettaglio con header
  (← Dashboard + breadcrumb), card **Parametri** con pulsante azione e card **Output**. GUI e console
  condividono **le stesse classi di logica** → azioni e output identici. La firma release adatta il
  contenuto del wireframe alla logica reale (Ed25519 detached, non Authenticode/JKS).
- **Genera chiavi `[06]`** (CLI `[6]` + GUI): crea una nuova coppia Ed25519 (unlock o release) con
  **backup automatico** delle esistenti in `.bak-<timestamp>`; stampa la pubblica Base64 DER (+
  `sign_key_id` per la release) e un **promemoria** di aggiornare `UnlockKeys`/`ReleaseKeys` nella
  DesktopApp e ricompilare prima di firmare/pubblicare. Il caricamento chiavi all'avvio non è più
  bloccante (si possono generare da zero).
- **Chiavi per-versione** (`KeyLocator`): keygen accetta una **versione** e scrive in
  `keys/<versione>/`; generazione e verifica unlock selezionano **automaticamente** la chiave dalla
  `appVersion` del `lock.lks` (fallback a `keys/`). Così l'unlock è firmato con la chiave della
  versione installata dall'utente e la verifica sull'app va a buon fine. (La firma release resta
  soggetta alla catena di update: verifica con la pubblica embeddata nella versione già installata.)
- Avvio: GUI di default; `--cli` (o ambiente headless) → menu testuale.
- **Fix tipografia UI**: corretto il letter-spacing (TRACKING) delle label, che usciva esploso;
  pulsante azione con triangolo "play" disegnato (il glifo ▶ non era reso da alcuni font).
- **Build non verificata** in questa sessione (richiede JDK 21): eseguire
  `cd Tool-CLI/lks-unlock-tool && mvn -q clean package` su JDK 21.

**File** — Nuovi: `ui/Theme.java`, `ui/IconBox.java`, `ui/ToolWindow.java`, `ui/DashboardView.java`,
`ui/OperationView.java`, `ui/GenerateView.java`, `ui/ValidateView.java`, `ui/ShowKeysView.java`,
`ui/VerifyView.java`, `ui/SignReleaseView.java`, `ui/KeyGenView.java`, `ConsoleApp.java`,
`KeyGenerator.java`. Modificati: `Main.java` (launcher GUI/`--cli`), `UnlockGenerator.java`
(`writeDesktopCopy`), `pom.xml` (v2.3.0), `README.md`.

> ⚠️ **Rotazione chiavi**: ruotare la chiave a ogni versione rompe la verifica sulle installazioni
> già distribuite (che hanno la vecchia pubblica embeddata). Vedi nota operativa nel README.

---

## [4.3.1] — 2026-06-20

Pannello admin e Dashboard rivisti, più il backend delle segnalazioni. Da task ClickUp "BugFix v4.3.1"
(eseguiti gli scope `webplatform` e `webapp`; l'intervento `desktop` è nella rispettiva lavorazione).

### `webplatform` — Pannello admin, segnalazioni e Dashboard

- **Segnalazioni (backend)** — migrazione `0009_reports.sql`: tabella `reports` (tipo, titolo,
  descrizione, app_version, hwid, email, status `aperta|in_lavorazione|chiusa`, nota admin) con RLS
  admin-only. RPC condivise con la DesktopApp: `open_report` (apre una segnalazione, anon),
  `list_my_reports` (elenco per dispositivo, anon) e `release_download_counts` (conteggi download per
  versione, solo admin).
- **`/admin` a 2 colonne** — SX pubblicazione release; DX **version tree** in timeline con
  attiva/disattiva/elimina e **badge conteggio download** per versione. In fondo, **card Segnalazioni**
  con filtro per stato, flusso di avanzamento (aperta → in lavorazione → chiusa) e nota interna.
- **Dashboard a 2 colonne** — DX: titolo, ultima versione, timeline versioni precedenti. SX: dati
  account in 4 blocchi verticali (email+nome, attivazione dispositivo, versioni scaricate, elimina account).
- `database.types.ts`: aggiunti `reports` + le 3 RPC. Versione WebPlatform a **4.3.1**.

**File** — Nuovi: `supabase/migrations/0009_reports.sql`. Modificati: `src/pages/AdminReleases.tsx`,
`src/pages/Dashboard.tsx`, `src/types/database.types.ts`, `src/pages/Home.tsx`, `package.json`.

**Verifica** — `tsc -b --force`: **OK**.

### `webapp` — Local Drop a layout, fix e tipologie credenziali (scaffold)

- **`/localdrop` — layout selezionabile**: nuovo switch **Lista / Griglia 2×1 / Griglia 2×2** (scelta
  ricordata). In **2×2** quattro card: *Cartelle* (cartelle non-archivio coi loro file), *Archivio*
  (cartelle contenenti archivi prodotti dal programma — euristica per estensione zip/rar/…; gli archivi
  sciolti caricati dall'utente restano nella card *File*), *File categorizzati* (file in radice con
  categoria), *File* (file in radice senza categoria/cartella). In **2×1** le card sono accorpate
  (*Archivio* = Cartelle+Archivio, *File* = Categorizzati+File). In **Lista** il comportamento resta l'albero attuale.
- **Filtro categorie + ricerca** nel Local Drop: chips per categoria-documento (stile credenziali) e
  **ricerca testuale su nomi file e nomi cartelle**. Upload "aggiungi documenti" che inserisce
  correttamente il file **dentro la cartella** scelta. Limite di upload portato a **10 GB** (client).
- **`/localdrop/text` dual-mode**: switch **Testo rapido / Carica file**, con selettori di **categoria**
  e **cartella** e condivisione immediata. Nessun vincolo tranne il file; se manca il nome si usa quello del file.
- **Dashboard**: i filtri delle categorie mostrano **solo quelle di tipo `CREDENZIALE`**.
- **`/password/new`**: la select categoria mostra **solo categorie `CREDENZIALE`** (rimosse le documentali).
- **Fix avatar a registrazione**: il redirect post-registrazione passa da `register → dashboard` a
  **`register → login`**, risolvendo alla radice il colore avatar errato al primo accesso.
- Versione Web App a **4.3.1** (`package.json`, `Costant.VERSION`).

**File** — Modificati: `src/pages/LocalDrop.tsx`,
`src/pages/TextFile.tsx`, `src/pages/Dashboard.tsx`, `src/pages/PasswordForm.tsx`, `src/pages/Register.tsx`,
`package.json`, `src/utils/Costant.ts`.

**Verifica** — `tsc -b`: **OK**; `vite build`: **OK** (JS 317 kB).

### `desktop` — Limite 10GB, logging, segnalazioni e tipologie password

- **Limite upload 1GB → 10GB** (`FileService` + `application.properties` multipart).
- **Logging riorganizzato** per categoria: `SYSTEM` (avvio/arresto/aggiornamenti), `ACCESSO` (login
  desktop + auth API con HTTP code), `FILE` (azioni Local Drop), **`API`** (ex `SERVICE`, ogni
  chiamata API — non nel dump) tramite un filtro dedicato, `INIT` (apertura pannello, decompressione
  `frontend.zip`). `AppLogger` con i nuovi helper `file()/api()/init()`.
- **Segnalazioni** (nuovo frame): elenco delle segnalazioni aperte da questo dispositivo con stato
  di lavorazione + form per aprirne. Flusso su Supabase via `ReportService` (RPC `open_report` /
  `list_my_reports`, già nella migrazione `0009_reports.sql`). Il dispositivo è identificato da un
  **device-id locale** (UUID per-install in `environment.lks`, nessun legame hardware).
- **Tipologie password** (config tipizzata + modello dinamico): `PasswordTypeRegistry` carica le 19
  tipologie dal bundle `password-types.json` (`defaultFields`/`supportedFields`) ed espone
  `GET /api/password-types`; logiche per campi obbligatori/opzionali e **validazione**. La
  credenziale ha ora `tipologia` e `campi` dinamici (valori **cifrati** AES; tipi sensibili
  `concealed`/`otp` nascosti in lista). Estendibile aggiornando solo il JSON.
- Versione DesktopApp a **4.3.1** (`pom.xml`, `AppVersion.FALLBACK`).

> Note: la compressione lossless del testo e la rimozione dell'hardware_id da Supabase restano
> rinviate; la reveal per-campo dei valori dinamici sensibili è un follow-up (i valori sono già
> memorizzati cifrati). Build non eseguita in sessione (no Maven/JDK 21): review statica completata.

## [4.3.0] — 2026-06-20

Categorizzazione e struttura a cartelle del Local Drop, da task ClickUp "Categorizzare e strutturare
Local Drop". In questa fase sono sviluppati gli scope `desktop` (backend) e `webapp` (frontend);
lo scope `webplatform` della stessa versione resta da completare.

### `desktop` — Categorie tipizzate, cartelle e compressione del Local Drop

- **Categorie tipizzate**: ogni categoria ha un tipo esclusivo `CREDENZIALE` o `FILE`, scelto alla
  creazione e modificabile solo se la categoria non ha associazioni. Le credenziali usano le
  categorie `CREDENZIALE`, i file del Local Drop quelle `FILE`.
- **File categorizzabili**: i file del Local Drop possono avere una categoria (di tipo `FILE`) e una
  collocazione in cartella, indipendenti e opzionali.
- **Cartelle gerarchiche**: nuovo modello cartella (nome + colore, per-utente) con gerarchia fino a
  **root + 3 livelli** di annidamento; una cartella può contenere sottocartelle e file. Cancellazione
  consentita solo a cartella vuota.
- **Condivisione per-file con visibilità derivata**: si condividono i singoli file; il destinatario
  vede le cartelle antenate del file condiviso ma al loro interno **solo i file effettivamente
  condivisi** (il resto resta invisibile).
- **Compressione intelligente delle cartelle** (in-place, ricorsiva, con conferma + log): decifra →
  comprime il contenuto per tipo di file → ricifra, **sostituendo gli originali**. Tre livelli a
  **target di riduzione** — ⚡ Fast (0-30%), ⚖️ Balanced (30-50%), 🔥 Aggressive (50-95%). Tecniche
  per tipo: immagini JPEG via `ImageIO` (qualità + downscale, sempre disponibile), PNG/immagini via
  `pngquant`/`cwebp` (conversione WebP) se presenti, video via `ffmpeg` (H265/CRF/scale), PDF via
  `Ghostscript`; **fallback**: se un tool esterno manca, il file viene saltato. La compressione può
  cambiare formato/estensione (es. PNG→WebP, video→H265/MP4); se il risultato non è più piccolo,
  l'originale è mantenuto. Tipi già compressi o testuali (docx/xlsx/zip/txt/json/csv) sono saltati
  (compressione lossless del testo rinviata).
- **Endpoint REST**: `categories` (campo `tipo` + filtro `?tipo=`), `folders` (CRUD + `move` +
  `compress`), `files` (`folderId`/`categoriaId` su upload, `PUT /{id}/meta`).
- Versione DesktopApp a **4.3.0** (`pom.xml`, `AppVersion.FALLBACK`).

> Nota: la rimozione dell'hardware_id da Supabase (prevista nel task) è **rinviata** a una fase
> successiva e non è inclusa in questo scope.

### `webapp` — Categorie tipizzate e Local Drop a cartelle

Allineamento del frontend al contratto backend 4.3.0 (nessuna modifica al backend; consumo delle
API esistenti `categories`/`folders`/`files`).

- **`/categories`**: la modale di creazione/modifica ha un **selettore di tipo** (Credenziali /
  Documenti); il tipo non è modificabile se la categoria ha associazioni. **Due palette distinte**
  (credenziali fredde/viola, documenti caldi/diversi). Le card mostrano un **badge di tipo** e il
  **numero di associazioni** (credenziali per le `CREDENZIALE`, documenti per le `FILE`), più filtro
  per tipo e ricerca.
- **`/localdrop`**: vista ad **albero di cartelle** con apertura/chiusura **a scomparsa al click
  sulla riga** (nessun tasto "visualizza" sulle cartelle). Ogni cartella ha azioni dedicate:
  **aggiungi documenti** (upload nella cartella), **nuova sottocartella** (disabilitata oltre i 3
  livelli), **comprimi**, rinomina/colore, elimina. **Colore cartella** scelto con color-picker
  libero (= colore dell'icona). I file mostrano **badge categoria** e un'azione per **assegnare
  categoria/cartella** (`PUT /files/{id}/meta`).
- **Flusso compressione**: modale che chiede il **livello** (⚡ Fast / ⚖️ Balanced / 🔥 Aggressive con
  i target di riduzione), avvisa che l'operazione **sostituisce gli originali** ed è irreversibile, poi
  mostra il **report** (byte iniziali→finali, % risparmio, elaborati/saltati, dettagli).
- Nuovo `folderService`, `utils/palettes.ts`; `fileService.upload` con `folderId`/`categoriaId` e
  `setMeta`; `categoryService.list(tipo?)`; `interface/types.ts` allineato (`tipo`, `FolderDto`,
  `CompressionReportDto`, …). Versione Web App a **4.3.0** (`package.json`, `Costant.VERSION`).

**File** — Nuovi: `src/service/folderService.ts`, `src/utils/palettes.ts`. Modificati:
`src/interface/types.ts`, `src/service/categoryService.ts`, `src/service/fileService.ts`,
`src/pages/Categories.tsx`, `src/pages/LocalDrop.tsx`, `src/pages/TextFile.tsx`, `package.json`,
`src/utils/Costant.ts`.

**Verifica** — `tsc -b`: **OK**; `vite build`: **OK** (JS 304 kB).

---

## [4.2.3] — 2026-06-20

Interventi da task ClickUp "Modifiche Da fare" (eseguiti gli scope `webplatform`, `webapp` e `desktop`).

### `webplatform` — Dashboard, navigazione e documentazione

- **Versioni precedenti** (Dashboard): ora mostrate come **timeline verticale con card** — pallino
  sulla linea, versione, data estesa, note di rilascio e pulsante di download, in tema col layout.
- **Scroll-to-top**: nuovo componente `ScrollToTop` in `App.tsx`. Ad ogni cambio di route (redirect
  inclusi) la vista torna in cima. Gli anchor della stessa pagina (footer, indice `/docs`) restano invariati.
- **Indice documentazione** (`/docs`): disposto in **colonna verticale** su tutti gli schermi
  (rimosso il layout a 2 colonne su tablet/desktop).
- Versione WebPlatform a **4.2.3** (`package.json`, footer).

**File** — Modificati: `src/pages/Dashboard.tsx`, `src/App.tsx`, `src/pages/Docs.tsx`,
`src/pages/Home.tsx`, `package.json`.

**Verifica** — `tsc -b --force`: **OK**.

### `webapp` — Stato host nella pagina di scelta utente

La pagina di scelta utente (pre-login) ora rileva lo stato del dispositivo host interrogando
`/api/system/status` (endpoint non pubblico → riporta lo stato reale anche senza token) e distingue:

- **DesktopApp non connessa**: microservizi attivi ma vault bloccato / accesso non effettuato
  (`401 VAULT_LOCKED` o `503 HOST_LOCKED`) → card informativa che avvisa che *la DesktopApp non ha
  effettuato l'accesso e quindi non è utilizzabile*, con pulsante **Riprova**.
- **Host non raggiungibile**: nessuna risposta dai microservizi (DesktopApp spenta) → card dedicata.
- **Host pronto**: elenco profili normale (comportamento invariato).

Indicatore di stato nel footer coerente con lo stato rilevato (verde/giallo/rosso). Nessuna
modifica al backend: il rilevamento sfrutta i codici di errore già esposti dal `JwtFilter`.
Versione Web App allineata a **4.2.3** (`package.json`, `Costant.VERSION` di default).

**File** — Modificati: `src/pages/UserPicker.tsx`, `package.json`, `src/utils/Costant.ts`.

**Verifica** — `tsc -b`: **OK**; `vite build`: **OK** (JS 285.9 kB).

### `desktop` — Switch tema rimosso e backend affidabile

- **Switch "Tema" rimosso** dal pannello: i campioni colore salvavano `environment.theme` ma
  nessuno lo leggeva (la palette è fissa nelle costanti di `Ui`), quindi non cambiavano nulla.
  Tolti dalla UI insieme ai metodi morti `themeSwatches()`/`swatch()`.
- **Avvio/arresto backend robusto** (`BackendManager`): **pre-check della porta** prima dell'avvio
  (niente più crash `Port 9507 already in use`), **pulizia del contesto su fallimento** (eliminato
  il mezzo-stato che impallava l'app) e **double-check reale** dopo start/stop (contesto attivo /
  porta liberata) invece di fidarsi della sola chiamata. Ogni transizione logga "in corso" e l'esito.
- **Stop off-EDT**: l'arresto del backend gira ora in background come l'avvio (`ManagerFrame`), così
  la UI non si congela durante lo shutdown di Tomcat.
- Versione DesktopApp a **4.2.3** (`pom.xml`, `AppVersion.FALLBACK`).

**File** — Modificati: `logistics/service/BackendManager.java`, `host/ManagerFrame.java`,
`pom.xml`, `common/AppVersion.java`.

**Verifica** — Build non eseguita in sessione (no Maven/JDK 21): review statica; `BackendManager`
riscritto pulito e `ManagerFrame` verificato integro (graffe bilanciate, NUL rimossi).

## [4.2.2] — 2026-06-19

Attivazione del dispositivo nella DesktopApp (gate di licenza) e rifiniture della WebPlatform.

### `desktop` — Attivazione del dispositivo

Colma il pezzo mancante del flusso licenze già pronto lato WebPlatform (tabella `activations`,
RPC `bind_activation`/`validate_license`). Al primo avvio l'app lega l'HWID al token e ad ogni
accesso valida la licenza.

- **Attivazione obbligatoria** al primo avvio tramite un modale non chiudibile (email + codice):
  `ActivationService` chiama le RPC Supabase `bind_activation` e `validate_license`, con esiti
  tipizzati (`ACTIVE`, `SUSPENDED`, `HWID_MISMATCH`, `NETWORK_ERROR`, …) e nessuna eccezione propagata.
- **Step "Attivazione" nel wizard** di onboarding: l'avanzamento è bloccato finché il binding non riesce.
- **Validazione ad ogni accesso**: revoca, sospensione o HWID diverso forzano la riattivazione; gli
  errori di rete (offline) sono tollerati e non bloccano l'uso.
- `EnvironmentData` ora persiste `activationEmail` e `activationToken`.

_Versione allineata a 4.2.2 in `pom.xml`, `AppVersion.FALLBACK` e `Web Platform/package.json`._

### `webplatform` — Release nascoste, footer e documentazione

- **Fix**: una versione "nascosta" da `/admin` (`is_active=false`) restava elencata e scaricabile.
  La Dashboard ora carica **solo le release attive**: le versioni nascoste spariscono dalla UI.
- **Footer completo**: tutte le voci collegate a destinazioni reali — Prodotto
  (Funzionalità/Sicurezza/Download in anchor, Changelog), Risorse (GitHub, Documentazione, Privacy,
  Termini). ⚠️ Sostituire la costante `GITHUB_URL` in `Home.tsx` con l'URL reale del repository.
- **Nuove pagine**: `/changelog` (renderizza questo file), `/terms` (Termini di servizio) e `/docs`
  (guida utente completa in 10 sezioni: installazione, uso, collegamento Web App ⇄ Desktop, FAQ).
- `scripts/sync-changelog.mjs` (hook `predev`/`prebuild`) mantiene `/changelog` sempre allineato.

---

## [4.2.1] — 2026-06-17

Allineamento di sicurezza cross-progetto sui difetti C1–C5 del report di verifica
(`Prompt/$-Allineamento`). Coinvolge desktop, webapp e webplatform.

### `desktop` — Aggiornamenti verificati e hardening (C1, C3, C4, C5)

- **Aggiornamenti firmati**: prima di applicare l'`.exe` scaricato, la DesktopApp verifica
  **SHA-256 + firma Ed25519**. Su esito negativo il file viene cancellato e l'updater non parte
  (comportamento *fail-closed*). Nuovi `ReleaseKeys` e `ReleaseVerifier`.
- **DTO pubblico ridotto**: `GET /api/auth/users` restituisce un `PublicUserDto` **senza email**.
- **Dedup endpoint**: rimosso il duplicato `GET /api/users`.
- **`lock.lks` senza dati personali**: il file di lock non contiene più email e token (resta
  `hwid`, `lockNonce`, `lockedAt`, `appVersion`, `reason`).

> ⚠️ Incollare la chiave pubblica di firma in `ReleaseKeys.PUBLIC_KEY_B64` prima del primo
> aggiornamento reale, altrimenti la verifica resta in `KEY_MISSING` e nessun update viene applicato.

### `webapp` — Allineamento ai DTO pubblici (C3, C4)

- Il frontend consuma la sola fonte pubblica `/api/auth/users` (`PublicUserDto[]`); rimosso ogni
  uso del vecchio `/api/users`.
- Il selettore utente pre-login non veicola più l'email: l'utente la digita al login.
- I dialog di condivisione (Dashboard, LocalDrop, TextFile) tipizzati su `PublicUserDto`.

### `webplatform` — Minimizzazione dati GDPR e diritto all'oblio (C2)

- **Migrazione `0007`** (⚠️ distruttiva, backup prima): rimosse `registrations.name` e
  `downloads.ip_address`; nuova RPC `delete_my_account()` che cancella i dati dell'utente con
  propagazione a cascata su download e attivazioni.
- **Frontend**: registrazione con la sola email (il nome resta nei metadati di autenticazione);
  nuova sezione **"Elimina account"** nella Dashboard.

### `webplatform` — Retention download e Privacy policy

- **Migrazione `0008`**: funzione `purge_old_downloads(90)` + job `pg_cron` giornaliero che elimina
  i record di download più vecchi di 90 giorni (GDPR Art. 5.1.e).
- **Pagina `/privacy`**: dichiara `hardware_id` come dato personale (binding licenza/anti-pirateria),
  la retention dei download e il diritto all'oblio self-service. Nessun indirizzo IP raccolto.

### `webplatform` — Script `publish-release` allineato alla firma

- `publish-release.mjs` ora legge le credenziali da `.env.local`/`.env`, **calcola lo `sha256`** del
  file e scrive `signature`/`sign_key_id` (firma dal sidecar `<exe>.sig` del Tool-CLI). Rifiuta le
  chiavi pubbliche e, in assenza di firma, pubblica la release come **non attiva**.

---

## [4.2.0] — 2026-06-17

**Release firmate**: catena di fiducia degli aggiornamenti (SHA-256 + Ed25519), introdotta sulla
piattaforma e sul tool.

### `webplatform` — Firma nella pubblicazione delle release (C1)

- **Migrazione `0006`** (non distruttiva): colonne `sha256`, `signature` (Ed25519, base64) e
  `sign_key_id` sulla tabella `releases`.
- **Pannello Admin**: SHA-256 calcolato nel browser, campo per la firma (incolla o file `.sig`),
  badge *firmata/non firmata* e blocco dell'attivazione finché la release non è firmata.

### `tool-cli` — Firma release e allineamento `reason` (C1, C5) — *artifact v2.1.0*

- Nuova voce di menu **`[5] Firma una release (.exe)`**: calcola lo `sha256` e produce una **firma
  Ed25519 detached** con una coppia di chiavi dedicata (separata da quella di unlock). Scrive i
  sidecar `<exe>.sha256` e `<exe>.sig` e stampa i tre valori da incollare nel pannello Admin.
- Allineamento C5: il lettore di `lock.lks` richiede solo `hwid` + `lockNonce`; email e token sono
  ora opzionali (mostrati come `-`), coerentemente con il file di lock privo di dati personali.

---

## [4.1.0] — 2026-06-16

### `desktop` — Controllo automatico degli aggiornamenti

- Rimosso il bottone manuale "Controlla aggiornamenti": il controllo viene eseguito automaticamente
  (off-EDT) subito dopo l'accesso.
- Nuovo **`UpdateBadge`** nel footer con pallino di notifica colorato per severità; **dialog di
  aggiornamento obbligatorio** non chiudibile per le versioni MAJOR.
- Classificazione degli aggiornamenti: **MAJOR** (obbligatorio), **MINOR** (consigliato),
  **PATCH** (facoltativo); ogni esito registrato nel log di sistema.

---

## [4.0.0] — 2026-05-31

### `core` — Baseline architettura v4

Riscrittura della logica del prodotto su quattro moduli:

- **DesktopApp** — applicazione Java con interfaccia Swing e backend Spring Boot; custodisce il vault
  cifrato e serve la Web App sulla rete locale.
- **WebApp** — frontend React che usa come API il backend locale della DesktopApp (stesso origine, LAN).
- **Tool-CLI** — strumento a riga di comando per la generazione delle credenziali di sblocco e la
  firma delle release (uso esclusivo dell'autore).
- **WebPlatform** — sito ufficiale per registrazione, download e gestione delle release.

Fondamenta di sicurezza: vault cifrati **AES-256-GCM**, master password derivata con **PBKDF2**,
backend in ascolto solo sulla LAN e SPA servita *same-origin* (nessuna esposizione cloud).
