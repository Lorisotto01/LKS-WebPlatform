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
Versione corrente: **4.2.2**.

---

## [4.2.3] — 2026-06-20

Rifiniture WebPlatform da task ClickUp "Modifiche Da fare" (eseguito lo scope `webplatform`;
gli interventi `desktop` e `webapp` della stessa versione restano da completare).

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
