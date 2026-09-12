-- ============================================================================
-- 01_wipe_all.sql — AZZERAMENTO TOTALE DEL PROGETTO
--
-- ############################################################################
-- #  DISTRUTTIVO E IRREVERSIBILE. Cancella:                                  #
-- #    - TUTTI gli utenti di autenticazione (auth.users)                     #
-- #    - i job pg_cron schedulati dalle migration                            #
-- #    - l'intero schema `public` (tabelle, funzioni, policy, dati)          #
-- #    - lo storico delle migration della CLI                                #
-- #                                                                          #
-- #  NON tocca lo storage: vedi il pre-step qui sotto.                       #
-- #                                                                          #
-- #  Non esiste un annullamento. Fai un backup prima:                        #
-- #    Dashboard -> Database -> Backups, oppure pg_dump.                     #
-- ############################################################################
--
-- Il bucket `assets` viene sempre preservato con tutto il suo contenuto: ospita
-- le immagini pubbliche del sito, la foto profilo e i banner delle email, che
-- non dipendono dai dati applicativi.
--
-- ----------------------------------------------------------------------------
-- PRE-STEP OBBLIGATORIO — svuotare lo storage
--
--   npm run db:wipe:storage
--
-- Supabase vieta la cancellazione diretta da `storage.objects` (trigger
-- `storage.protect_delete`): passa dalla Storage API, non dal SQL. In cambio i
-- file vengono cancellati davvero, mentre le vecchie `delete` SQL rimuovevano
-- solo i metadati e lasciavano i file orfani nel backend.
--
-- Se salti il pre-step lo script non fallisce: segnala quanti oggetti restano.
-- ----------------------------------------------------------------------------
-- COME SI ESEGUE (Supabase -> SQL Editor -> New query)
--
--   1. Togli il commento alla riga `set slk.wipe_confirm ...` qui sotto.
--   2. Incolla TUTTO il file ed esegui.
--   3. Rimetti il commento subito dopo, per non rieseguirlo per sbaglio.
--
-- Senza il passo 1 lo script si ferma e NON tocca nulla.
--
-- Nota di sicurezza: tutto il lavoro distruttivo sta dentro un UNICO blocco
-- atomico che come prima cosa verifica la conferma. Non ci sono istruzioni
-- distruttive al primo livello, quindi lo script e' sicuro anche se eseguito
-- da un client che tira dritto dopo un errore (come `psql` senza
-- ON_ERROR_STOP): se la sicura e' inserita, il blocco non esegue nulla.
-- ----------------------------------------------------------------------------

-- >>> TOGLI IL COMMENTO ALLA RIGA SEGUENTE PER ARMARE LO SCRIPT <<<
-- set slk.wipe_confirm = 'CANCELLA-TUTTO';


do $wipe$
declare
  v_users   bigint;
  v_objects bigint;
  v_buckets bigint;
  v_jobs    bigint := 0;
  r         record;
begin
  -- ==========================================================================
  -- 0. SICURA — se non e' disinserita, esce senza toccare niente.
  -- ==========================================================================
  if coalesce(current_setting('slk.wipe_confirm', true), '') <> 'CANCELLA-TUTTO' then
    raise exception using
      errcode = '42501',
      message = 'Script non armato: nessuna modifica effettuata.',
      hint    = 'Togli il commento alla riga:  set slk.wipe_confirm = ''CANCELLA-TUTTO'';  in cima al file, poi riesegui.';
  end if;

  raise notice 'Sicura disinserita: procedo con l''azzeramento totale.';

  -- ==========================================================================
  -- 1. AUTENTICAZIONE
  -- ==========================================================================
  -- Prima dello schema public: eventuali trigger su auth.users potrebbero
  -- dipendere da funzioni che stiamo per eliminare.
  -- identities, sessions, refresh_tokens e mfa_factors si ripuliscono a cascata.
  delete from auth.users;
  get diagnostics v_users = row_count;
  raise notice 'Auth: rimossi % utenti. Dovrai registrarti di nuovo sul sito.', v_users;

  -- ==========================================================================
  -- 2. PG_CRON — job schedulati dalle migration
  -- ==========================================================================
  -- I job vivono nello schema `cron`, che il drop di `public` NON tocca:
  -- sopravvivrebbero al wipe continuando a invocare funzioni ormai inesistenti
  -- (`expire_stale_orders` gira ogni 5 minuti e riempirebbe di errori il log
  -- del database). Vanno tolti qui; le migration 0001 e 0002 li rischedulano.
  --
  -- Si disiscrivono per nome: un job aggiunto a mano dall'admin non viene
  -- toccato. Se pg_cron non e' installato, `cron.job` non esiste e si salta.
  if to_regclass('cron.job') is not null then
    for r in
      select jobname from cron.job
       where jobname in ('purge_old_downloads_daily', 'expire_stale_orders_5min')
    loop
      execute format('select cron.unschedule(%L)', r.jobname);
      v_jobs := v_jobs + 1;
    end loop;
    raise notice 'pg_cron: rimossi % job (li rischedulano le migration 0001 e 0002).', v_jobs;
  else
    raise notice 'pg_cron non installato: nessun job da rimuovere.';
  end if;

  -- ==========================================================================
  -- 3. STORAGE — verifica, non cancellazione
  -- ==========================================================================
  -- Fino alla v2 dello storage, qui si facevano due `delete` su storage.objects
  -- e storage.buckets. Supabase ora lo impedisce con il trigger
  -- `storage.protect_delete()`:
  --
  --   ERROR: Direct deletion from storage tables is not allowed.
  --          Use the Storage API instead.
  --
  -- Il blocco e' sensato e sana un difetto che questo script aveva da sempre:
  -- cancellare le righe di storage.objects rimuoveva i METADATI ma lasciava i
  -- file veri nel backend, orfani e invisibili. La cancellazione reale passa
  -- dalla Storage API, quindi il wipe dello storage e' un PRE-STEP:
  --
  --   npm run db:wipe:storage        (supabase storage rm -r, bucket per bucket)
  --
  -- Qui ci limitiamo a contare cosa resta: nessuna eccezione, perche' lo storage
  -- e' indipendente dai dati applicativi e un residuo non compromette la
  -- ricostruzione dello schema.
  select count(*) into v_objects
    from storage.objects where bucket_id is distinct from 'assets';
  select count(*) into v_buckets
    from storage.buckets where id is distinct from 'assets';

  if v_objects > 0 then
    raise notice 'Storage: restano % oggetti in % bucket (assets escluso).', v_objects, v_buckets;
    raise notice '  -> svuotali con:  npm run db:wipe:storage';
    raise notice '  -> oppure da Dashboard: Storage -> bucket -> seleziona tutto -> Delete';
    raise notice '  I bucket vuoti restano: li riallinea la migration 0006_storage.';
  else
    raise notice 'Storage: nessun oggetto residuo fuori da assets.';
  end if;

  -- ==========================================================================
  -- 4. SCHEMA PUBLIC — wipe completo e ripristino dei grant standard
  -- ==========================================================================
  -- Il cascade elimina anche le policy su storage.objects che dipendono da
  -- public.is_admin(): le ricrea la migration 0006_storage.sql.
  execute 'drop schema if exists public cascade';
  execute 'create schema public';

  execute 'grant usage on schema public to postgres, anon, authenticated, service_role';
  execute 'grant all   on schema public to postgres, anon, authenticated, service_role';

  execute 'alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role';
  execute 'alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role';
  execute 'alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role';

  execute 'comment on schema public is ''standard public schema''';

  -- pgcrypto serve a gen_random_uuid(); la 0001 la crea comunque, questo e'
  -- solo un anticipo innocuo (il cascade puo' averla portata via).
  execute 'create extension if not exists pgcrypto';

  raise notice 'Schema public azzerato e ricreato con i grant standard.';

  -- ==========================================================================
  -- 5. STORICO MIGRATION
  -- ==========================================================================
  -- `drop schema public cascade` NON tocca supabase_migrations.schema_migrations,
  -- che vive in un altro schema. Se lo si lascia popolato, la CLI crede che le
  -- migration siano gia' applicate, le salta e riparte da meta' catena fallendo
  -- sulla prima dipendenza mancante. Azzerarlo e' obbligatorio, non opzionale.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'truncate table supabase_migrations.schema_migrations';
    raise notice 'Storico migration azzerato: la CLI riapplichera'' la catena da 0001.';
  else
    raise notice 'Nessuno storico migration presente (CLI mai usata su questo progetto).';
  end if;

  raise notice 'AZZERAMENTO COMPLETATO.';
end
$wipe$;

-- Disarma la sicura, cosi' una seconda esecuzione distratta non passa.
reset slk.wipe_confirm;

-- ============================================================================
-- FATTO. Ora, in quest'ordine:
--
--   0. npm run db:wipe:storage        -> se non l'hai gia' fatto come pre-step
--   1. migrations/0001_foundation.sql .. 0006_storage.sql   (IN ORDINE)
--        - con la CLI:  supabase db push
--        - a mano:      incollali uno per uno nel SQL Editor
--   2. Registrati sul sito con l'email che vuoi rendere admin
--   3. scripts/02_set_admin.sql       -> ti promuove ad admin
--   4. Sul sito: LOGOUT + LOGIN       -> il JWT prende il ruolo
--   5. scripts/03_seed_content.sql    -> genera guida, /chi-sono e impostazioni
--
-- Il passo 2 va PRIMA del 3: lo script admin promuove un utente che deve gia'
-- esistere in auth.users.
-- ============================================================================
