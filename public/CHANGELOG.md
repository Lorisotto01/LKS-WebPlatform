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
Versione corrente: **4.3.6**.

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
