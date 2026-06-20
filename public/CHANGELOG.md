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
Versione corrente: **4.3.0**.

---

## [4.3.1] — 2026-06-20

Pannello admin e Dashboard rivisti, più il backend delle segnalazioni. Da task ClickUp "BugFix v4.3.1"
(eseguito lo scope `webplatform`; gli interventi `webapp` e `desktop` sono nelle rispettive lavorazioni).

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
