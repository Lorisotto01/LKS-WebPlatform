-- ============================================================================
-- SETUP ADMIN — eseguire UNA VOLTA SOLA.
-- Dove: Supabase -> (il tuo progetto) -> SQL Editor -> New query ->
--       incolla TUTTO questo -> Run (o Ctrl+Enter).
-- Prerequisito: esserti gia registrato sul sito con l'email qui sotto.
-- Dopo aver eseguito: sul sito fai LOGOUT e LOGIN -> appare il bottone "Admin".
-- ============================================================================

-- 1) Permessi: autorizza a pubblicare release SOLO chi e admin.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

drop policy if exists releases_admin_write on public.releases;
create policy releases_admin_write on public.releases
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists releases_objects_admin_insert on storage.objects;
create policy releases_objects_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'releases' and public.is_admin());

drop policy if exists releases_objects_admin_update on storage.objects;
create policy releases_objects_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'releases' and public.is_admin())
  with check (bucket_id = 'releases' and public.is_admin());

drop policy if exists releases_objects_admin_delete on storage.objects;
create policy releases_objects_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'releases' and public.is_admin());

-- 2) Rendi ADMIN il tuo account (cambia l'email se ne usi un'altra).
update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
  where email = 'lorisotto2001@gmail.com';
