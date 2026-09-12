# Database SecureLocalShare — migration e script

```
supabase/
  migrations/   0001..0006   schema: si applicano in ordine, sempre tutte
  scripts/      01..03       operazioni manuali dal SQL Editor
  functions/                 Edge Functions (checkout, webhook, email)
  templates/                 template email di Supabase Auth
```

## Ricostruire il progetto da zero

L'ordine conta. Il passo 5 va **dopo** il 4 perché promuove un account che deve
già esistere.

| # | Cosa | Dove |
| - | ---- | ---- |
| 1 | `npm run db:wipe:storage` | terminale — svuota i bucket via Storage API |
| 2 | `scripts/01_wipe_all.sql` | SQL Editor — azzera tutto |
| 3 | `migrations/0001` → `0006` | `supabase db push`, o a mano in ordine |
| 4 | Registrati sul sito con l'email dell'admin | browser |
| 5 | `scripts/02_set_admin.sql` | SQL Editor |
| 6 | **Logout + login** sul sito | browser |
| 7 | `scripts/03_seed_content.sql` | SQL Editor |

Il passo 6 non è facoltativo: il ruolo admin viaggia dentro il JWT, e quello in
tasca al browser è stato emesso prima della promozione.

## Le migration

Sei file, da applicare sempre in ordine crescente. Sono tutte idempotenti:
rieseguirle non produce errori né duplicati.

| File | Contenuto |
| ---- | --------- |
| `0001_foundation` | estensioni, `current_email()`, `is_admin()`, catalogo piani, `registrations`, `downloads`, `releases`, GDPR e retention |
| `0002_billing` | `discounts`, `orders`, `subscriptions`, `unlock_files`, le RPC di contabilità e il TTL degli ordini abbandonati |
| `0003_licensing` | `activations`, `lock_events` e le RPC chiamate da DesktopApp e Tool-CLI |
| `0004_support` | `reports`, `report_attachments` e le RPC delle segnalazioni |
| `0005_content` | tabelle di `/docs`, `/chi-sono` e recensioni — **vuote** |
| `0006_storage` | i 4 bucket e tutte le policy su `storage.objects` |

### Perché quest'ordine

Due vincoli sono rigidi e non vanno invertiti:

- **`0001` per prima.** `current_email()` e `is_admin()` sono usate dentro le
  `create policy` di quasi ogni tabella. Un riferimento dentro il corpo di una
  funzione `plpgsql` non viene risolto alla creazione, ma quello in una policy
  sì: se l'helper manca, la migration fallisce con `SQLSTATE 42883`.
- **`plans` prima di `registrations`.** `registrations.plan` ha una FK su
  `plans(code)` e il default `'free'` deve già esistere in catalogo. Per questo
  il seed dei piani sta nella migration e non negli script: è un prerequisito
  strutturale, non un contenuto editoriale.

`0006` va per ultima perché ogni policy di storage usa gli helper di `0001` e la
convenzione di percorso `<email>/<file>.lks` definita in `0002`.

### Schema e contenuti sono separati

`0005_content` crea le tabelle **vuote**; i testi della guida e della pagina
`/chi-sono` stanno in `scripts/03_seed_content.sql`. Lo schema è codice e si
rigioca sempre identico; i contenuti sono dati che l'admin modifica dal pannello,
e una migration non deve sovrascriverli a ogni deploy.

## Gli script

### `01_wipe_all.sql` — azzeramento totale

Cancella utenti di autenticazione, job pg_cron, schema `public` e storico
migration. **Non tocca lo storage**: quello è il pre-step `db:wipe:storage`.

È armato da una sicura: finché non togli il commento alla riga
`set slk.wipe_confirm = 'CANCELLA-TUTTO';` in cima al file, non tocca niente.
Tutto il lavoro distruttivo sta dentro un unico blocco atomico che verifica la
conferma come prima istruzione, quindi la sicura tiene anche con un client che
tira dritto dopo un errore.

Tre cose da sapere:

- **Lo storage non si cancella più da SQL.** Supabase blocca le `delete` dirette
  su `storage.objects` con il trigger `storage.protect_delete()`:

  ```
  ERROR: Direct deletion from storage tables is not allowed.
         Use the Storage API instead.
  ```

  È un miglioramento: le vecchie `delete` SQL rimuovevano la riga di metadati ma
  lasciavano il file vero nel backend, orfano e irraggiungibile. Ora si passa da
  `npm run db:wipe:storage`, che cancella davvero. Lo script SQL si limita a
  contare cosa resta e non fallisce se salti il pre-step.
- **I job pg_cron vanno rimossi qui.** Vivono nello schema `cron`, che
  `drop schema public cascade` non tocca: sopravvivrebbero al wipe invocando
  funzioni ormai inesistenti — `expire_stale_orders_5min` ogni cinque minuti. Lo
  script li disiscrive per nome; le migration `0001` e `0002` li rischedulano.
- **Azzerare lo storico migration è obbligatorio.** `drop schema public cascade`
  non tocca `supabase_migrations.schema_migrations`, che vive in un altro schema:
  se resta popolato, la CLI crede che le migration siano già applicate, le salta
  e riparte da metà catena fallendo sulla prima dipendenza mancante.

### `db:wipe:storage` — svuotare i bucket

```bash
npm run db:wipe:storage:dry   # elenca cosa cancellerebbe
npm run db:wipe:storage       # cancella, previa conferma "CANCELLA"
```

Svuota ogni bucket **tranne `assets`**, che conserva immagini del sito, foto
profilo e banner delle email. I bucket restano in piedi, vuoti: li riallinea
`0006_storage.sql`. Legge `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` da
`.env.local`, come `publish-release.mjs`, e rifiuta di partire se gli passi una
chiave pubblicabile.

### `02_set_admin.sql` — promuovere un admin

Imposta l'email nella riga `set slk.admin_email` in cima, esegui, poi **logout e
login**.

Il ruolo finisce in `auth.users.raw_app_meta_data`, che diventa il claim
`app_metadata` del JWT letto da `is_admin()`. `app_metadata` non è modificabile
dal client — al contrario di `user_metadata` — quindi nessuno può promuoversi
admin dal browser.

Lo script rifiuta di procedere se l'email non corrisponde a un account esistente,
e in coda stampa l'elenco di chi è admin. In fondo al file c'è la query
commentata per togliere il ruolo.

### `03_seed_content.sql` — generare i contenuti

Popola `/docs` (27 blocchi), le impostazioni della pagina e `/chi-sono`.

**Sovrascrive**: `doc_blocks` viene svuotata e ricostruita, quindi le modifiche
fatte da `/admin/docs-manager` vanno perse. È voluto — serve a riportare la guida
allo stato canonico. La foto profilo viene invece preservata, perché vive nel
bucket `assets` e non è un contenuto testuale.

Le `position` sono spaziate di 10 così l'editor può inserire blocchi in mezzo
senza rinumerare.

## Note d'ambiente

**pg_cron.** Due job, entrambi racchiusi in un gestore di eccezioni: se
l'estensione non è disponibile la migration non fallisce, emette un avviso e il
job va schedulato a mano da Dashboard → Database → Extensions. Erano gli unici
punti dell'intera catena che potevano interrompere una rimigrazione per motivi
d'ambiente.

| Job | Cadenza | Cosa fa |
| --- | ------- | ------- |
| `purge_old_downloads_daily` (`0001`) | `30 3 * * *` | cancella lo storico download oltre i 90 giorni |
| `expire_stale_orders_5min` (`0002`) | `*/5 * * * *` | marca `failed` gli ordini `pending` oltre `orders.expires_at` |

Se `expire_stale_orders_5min` non parte, gli ordini abbandonati restano
`pending` sul database: la dashboard e il pannello admin li mostrano comunque
già scaduti perché lo stato è ricalcolato lato UI da `expires_at`, ma le RPC di
contabilità leggono il dato grezzo. Il job non è quindi facoltativo.

**Migration applicate a mano.** Incollarle nel SQL Editor non aggiorna
`supabase_migrations.schema_migrations`. Se poi usi `supabase db push`, allinea lo
storico o la CLI proverà a riapplicarle.

## Storico

Questa catena sostituisce le 20 migration precedenti (`0001_init` →
`0020_v461_report_lock_text_ts`), recuperabili dal commit `6b80f2e`:

```bash
git show 6b80f2e:supabase/migrations/0001_init.sql
```

La consolidazione è stata verificata rigiocando entrambe le catene su
PostgreSQL 16 e confrontando lo schema risultante: **372 oggetti identici** fra
colonne con tipo e nullability, firme delle funzioni, policy, indici, vincoli e
bucket.
