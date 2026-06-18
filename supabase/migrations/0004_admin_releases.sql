-- ============================================================================
-- Fase 5/7 — Pubblicazione release DAL BROWSER da parte del solo admin.
--
-- Obiettivo: l'autore pubblica nuove release dal pannello /admin del sito gia
-- online, senza usare la service_role nel client. La parte privilegiata e gestita
-- interamente dalla RLS: solo l'utente con app_metadata.role = 'admin' puo
-- scrivere sulla tabella `releases` e caricare file nel bucket privato `releases`.
--
-- Perche e sicuro: app_metadata NON e modificabile dall'utente (a differenza di
-- user_metadata). Solo la service_role o la Dashboard possono impostarlo, quindi
-- nessuno puo auto-promuoversi admin dal browser.
-- ============================================================================

-- Helper: l'utente loggato e admin? Legge il ruolo dal JWT (app_metadata).
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
$$;

-- ----------------------------------------------------------------------------
-- Tabella releases: l'admin puo inserire / aggiornare / eliminare.
-- (La policy di sola lettura per gli utenti autenticati resta invariata.)
-- ----------------------------------------------------------------------------
drop policy if exists releases_admin_write on public.releases;
create policy releases_admin_write on public.releases
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Storage bucket privato 'releases': l'admin puo caricare/sostituire/eliminare
-- gli oggetti (.exe). La lettura per i signed URL e gia coperta dalle policy
-- esistenti (releases_objects_read / _anon).
-- ----------------------------------------------------------------------------
drop policy if exists releases_objects_admin_insert on storage.objects;
create policy releases_objects_admin_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'releases' and public.is_admin());

drop policy if exists releases_objects_admin_update on storage.objects;
create policy releases_objects_admin_update on storage.objects
    for update to authenticated
    using (bucket_id = 'releases' and public.is_admin())
    with check (bucket_id = 'releases' and public.is_admin());

drop policy if exists releases_objects_admin_delete on storage.objects;
create policy releases_objects_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'releases' and public.is_admin());

-- ============================================================================
-- SETUP UNA TANTUM — promuovi il tuo account ad admin.
-- Esegui questa riga UNA VOLTA nel SQL editor di Supabase, poi rifai il login
-- (serve a rigenerare il JWT con il nuovo ruolo). Sostituisci l'email se diversa.
-- ============================================================================
-- update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
--   where email = 'lorisotto2001@gmail.com';
