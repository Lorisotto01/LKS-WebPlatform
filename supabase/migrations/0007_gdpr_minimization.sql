-- ============================================================================
-- C2 — Minimizzazione dati (GDPR) + diritto all'oblio.
--
-- Principi: data minimization (Art. 5.1.c) e diritto alla cancellazione
-- (Art. 17). Rimuoviamo dati ridondanti/non necessari e forniamo una
-- cancellazione self-service per l'utente autenticato.
--
-- ⚠️  MIGRAZIONE DISTRUTTIVA: i due `drop column` eliminano dati in modo
--     irreversibile. ESEGUIRE UN BACKUP PRIMA (vedi DEPLOY.md → "Backup
--     pre-0007"). Se serve audit storico, esportare le colonne prima del drop:
--       create table public._bak_0007_registrations_name as
--         select id, email, name from public.registrations;
--       create table public._bak_0007_downloads_ip as
--         select id, email, ip_address from public.downloads;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) registrations.name — ridondante: il nome resta in
--     auth.users.raw_user_meta_data.name (user_metadata), unica fonte di verità.
-- ----------------------------------------------------------------------------
alter table public.registrations drop column if exists name;

-- ----------------------------------------------------------------------------
-- (b) downloads.ip_address — mai scritto dal client e non necessario
--     all'autenticità del download (l'audit è già legato all'email).
-- ----------------------------------------------------------------------------
alter table public.downloads drop column if exists ip_address;

-- ----------------------------------------------------------------------------
-- (c) Diritto all'oblio (Art. 17): cancellazione self-service.
--     Cancella la registrazione dell'utente loggato; le FK `on delete cascade`
--     già presenti propagano su downloads (0001) e activations (0005).
--     La riga in auth.users va rimossa separatamente via Admin API / Edge
--     Function dedicata (il DB non può cancellarsi da solo lo schema auth qui).
-- ----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.registrations where email = public.current_email();
end;
$$;

revoke all     on function public.delete_my_account() from public;
grant  execute on function public.delete_my_account() to authenticated;

-- ----------------------------------------------------------------------------
-- Verifica cascata (informativa): già garantita dalle FK esistenti.
--   downloads.email    -> registrations.email   on delete cascade   (0001)
--   activations.email  -> registrations.email   on delete cascade   (0005)
-- Nessuna ALTER FK necessaria qui.
-- ----------------------------------------------------------------------------
