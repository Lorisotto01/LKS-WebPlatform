-- ============================================================================
-- C2 (follow-up) — Retention dei dati di audit `downloads` (GDPR Art. 5.1.e).
--
-- I record di download sono dati di audit a breve termine: non vanno conservati
-- a tempo indeterminato. Politica di conservazione: 90 giorni. Oltre tale
-- soglia i record vengono cancellati automaticamente da un job pianificato.
--
-- Implementazione: funzione di purge + schedulazione con pg_cron (disponibile
-- su Supabase). In alternativa la stessa funzione può essere invocata da una
-- Edge Function schedulata (Scheduled Functions) o da un cron esterno via RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Funzione di purge: elimina i download più vecchi della retention (default 90gg).
-- SECURITY DEFINER perché eseguita dal job (non da un utente autenticato).
-- ----------------------------------------------------------------------------
create or replace function public.purge_old_downloads(p_days int default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.downloads
   where downloaded_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Non esporre la funzione ai client: la esegue solo il job pianificato / service_role.
revoke all on function public.purge_old_downloads(int) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Schedulazione con pg_cron (eseguire nel database `postgres` del progetto).
-- pg_cron è disponibile su Supabase ma va abilitato una tantum (Dashboard →
-- Database → Extensions → "pg_cron", oppure la create extension qui sotto).
-- Il job gira ogni giorno alle 03:30 UTC.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

-- Ricrea il job in modo idempotente: rimuove l'eventuale schedulazione omonima
-- prima di registrarla di nuovo.
do $$
begin
  perform cron.unschedule('purge_old_downloads_daily')
   where exists (select 1 from cron.job where jobname = 'purge_old_downloads_daily');
exception when undefined_table or undefined_function then
  -- pg_cron non ancora disponibile in questo contesto: ignora (verrà schedulato
  -- manualmente dalla Dashboard). Vedi nota sotto.
  null;
end $$;

select cron.schedule(
  'purge_old_downloads_daily',
  '30 3 * * *',
  $$ select public.purge_old_downloads(90); $$
);

-- ----------------------------------------------------------------------------
-- Nota operativa
-- - Verifica job:      select * from cron.job;
-- - Storico esecuzioni: select * from cron.job_run_details order by start_time desc limit 20;
-- - Esecuzione manuale: select public.purge_old_downloads(90);
-- - Disattivazione:     select cron.unschedule('purge_old_downloads_daily');
-- Se pg_cron non è abilitabile sul piano in uso, schedulare una Edge Function
-- che chiami `purge_old_downloads` via service_role (stessa logica, 90 giorni).
-- ----------------------------------------------------------------------------
