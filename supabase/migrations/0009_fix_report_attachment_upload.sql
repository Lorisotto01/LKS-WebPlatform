-- ============================================================================
-- 0009_fix_report_attachment_upload.sql — Ripristina l'upload degli allegati
-- delle segnalazioni, rotto dalla 0007 (task 869f33v5b).
--
-- Va applicata SOPRA un database che ha gia' eseguito 0001-0008. Idempotente.
--
-- BUG: la policy report_attach_anon_insert introdotta in 0007 (rilievo M5)
-- verifica l'esistenza della segnalazione con una subquery diretta su
-- public.reports:
--
--   exists (select 1 from public.reports r where r.id::text = ... )
--
-- Una policy NON e' SECURITY DEFINER: la subquery gira con i permessi del
-- ruolo che sta scrivendo (anon, per la DesktopApp), e public.reports ha RLS
-- attiva con la sola policy reports_admin_all (for all to authenticated using
-- is_admin()). Per anon quella tabella e' quindi sempre vuota agli occhi della
-- subquery, l'exists() e' sempre false, e ogni upload dell'allegato fallisce
-- con 403 "new row violates row-level security policy" — esattamente l'errore
-- riportato dalla DesktopApp, per ogni segnalazione, non solo occasionalmente.
--
-- FIX: la verifica passa da una funzione SECURITY DEFINER (bypassa la RLS di
-- reports come gia' fa device_email() in 0007), referenziata dalla policy
-- invece della subquery diretta.
-- ============================================================================

create or replace function public.report_accepts_upload(p_report_id text)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.reports r
     where r.id::text = p_report_id
       and r.created_at > now() - interval '1 day'
  );
$fn$;

comment on function public.report_accepts_upload(text) is
  'True se p_report_id e'' una segnalazione esistente aperta nelle ultime 24h. '
  'SECURITY DEFINER: usata dentro la policy di storage report_attach_anon_insert, '
  'dove una subquery diretta su reports fallirebbe per via della RLS della tabella.';

-- Chiamata direttamente dal motore delle policy nel contesto del ruolo anon:
-- deve restare eseguibile, a differenza di device_email() che e' invocata solo
-- da altre funzioni SECURITY DEFINER.
grant execute on function public.report_accepts_upload(text) to anon, authenticated;

drop policy if exists report_attach_anon_insert on storage.objects;
create policy report_attach_anon_insert on storage.objects
    for insert to anon, authenticated
    with check (
      bucket_id = 'report-attachments'
      and (storage.foldername(name))[1] is not null
      and public.report_accepts_upload((storage.foldername(name))[1])
    );

-- ============================================================================
-- Fine 0009_fix_report_attachment_upload.sql
-- ============================================================================
