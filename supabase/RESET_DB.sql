-- ============================================================================
-- RESET_DB — AZZERA E RICOSTRUISCE DA ZERO (Supabase, SQL Editor hosted).
--
-- ⚠️  DISTRUTTIVO: elimina TUTTI i dati e gli oggetti dello schema `public`
--     (registrazioni, attivazioni, download, release, recensioni, docs, report…).
--     FALLO SOLO se vuoi ripartire da zero. Backup consigliato prima:
--     Dashboard -> Database -> Backups (o un pg_dump).
--
-- ORDINE DI ESECUZIONE (tutto nel SQL Editor del progetto hosted):
--   1) Questo file (RESET_DB.sql)            -> azzera lo schema public
--   2) (opzionale) blocco "AUTH" qui sotto   -> azzera gli utenti auth
--   3) migrations/0001_init.sql              -> ... in ORDINE crescente ...
--      migrations/0003 ... fino a 0013       -> (0002 è solo seed di esempio: opzionale)
--   4) Ri-registrati sul sito con la tua email
--   5) SETUP_ADMIN.sql                       -> ti rende admin
--   6) Sul sito: LOGOUT + LOGIN              -> il JWT prende il ruolo admin
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Wipe completo dello schema public + ripristino dei grant standard Supabase.
--    Il cascade rimuove anche le policy su storage.objects che dipendono da
--    public.is_admin(): vengono ricreate da 0004 + SETUP_ADMIN. I bucket storage
--    (releases/assets/report-attachments) restano: le migration li reinseriscono
--    in modo idempotente (on conflict do nothing).
-- ----------------------------------------------------------------------------
drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all   on schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

comment on schema public is 'standard public schema';

-- pgcrypto serve a gen_random_uuid()/digest usati dalle migration (0001 lo crea
-- comunque con "create extension if not exists", questo è solo un anticipo sicuro).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 2) (OPZIONALE) Azzera gli utenti di autenticazione, per ripartire davvero da
--    zero anche lato login. NON necessario se vuoi tenere il tuo account: in tal
--    caso salta questo blocco e passa direttamente alle migration + SETUP_ADMIN.
--
--    ⚠️  Cancella TUTTI gli account. Dopo dovrai ri-registrarti sul sito.
--    Decommenta le due righe per eseguirlo.
-- ----------------------------------------------------------------------------
-- delete from auth.users;            -- rimuove tutti gli utenti
-- -- (identities/sessions vengono ripulite a cascata dai vincoli di auth)

-- ============================================================================
-- FINE RESET_DB. Ora esegui, IN ORDINE, i file in migrations/ (0001 -> 0013),
-- poi ri-registrati e lancia SETUP_ADMIN.sql, infine LOGOUT + LOGIN.
-- ============================================================================
