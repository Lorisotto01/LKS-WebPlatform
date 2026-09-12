-- ============================================================================
-- 0006_storage.sql — Bucket e policy di storage.
--
--   releases           privato  .exe delle release; download solo via signed URL
--   assets             PUBBLICO immagini del sito, foto profilo, banner email
--   report-attachments privato  screenshot allegati alle segnalazioni (max 5 MB)
--   unlocks            privato  unlock.lks, leggibili solo dal proprietario
--
-- Va per ultima perche' ogni policy usa public.is_admin() e public.current_email()
-- (0001) e la policy di unlocks si appoggia alla convenzione di percorso
-- <email>/<file>.lks definita da public.unlock_files (0002).
--
-- Idempotente.
-- ============================================================================

-- ============================================================================
-- 1. BUCKET
-- ============================================================================
-- 'releases' resta privato in modo forzato: se esiste ed e' stato reso pubblico
-- per errore, questa riga lo richiude.
insert into storage.buckets (id, name, public)
values ('releases', 'releases', false)
on conflict (id) do update set public = false;

-- 'assets' e' l'unico bucket pubblico: i client di posta non hanno una sessione,
-- quindi le immagini delle email devono essere raggiungibili senza auth.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-attachments', 'report-attachments', false, 5242880,
        array['image/png', 'image/jpeg'])
on conflict (id) do update
    set file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public)
values ('unlocks', 'unlocks', false)
on conflict (id) do nothing;

-- ============================================================================
-- 2. releases — lettura per signed URL, scrittura admin
-- ============================================================================
-- createSignedUrl richiede un grant di SELECT sull'oggetto. Gli oggetti restano
-- privati: l'accesso passa sempre da un link a tempo, mai da un URL pubblico.
drop policy if exists releases_objects_read on storage.objects;
create policy releases_objects_read on storage.objects
    for select to authenticated
    using (bucket_id = 'releases');

-- Anche anon: serve al controllo aggiornamenti della DesktopApp senza login.
drop policy if exists releases_objects_read_anon on storage.objects;
create policy releases_objects_read_anon on storage.objects
    for select to anon
    using (bucket_id = 'releases');

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
-- 3. assets — lettura pubblica, scrittura admin
-- ============================================================================
drop policy if exists assets_public_read on storage.objects;
create policy assets_public_read on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'assets');

drop policy if exists assets_admin_insert on storage.objects;
create policy assets_admin_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists assets_admin_update on storage.objects;
create policy assets_admin_update on storage.objects
    for update to authenticated
    using (bucket_id = 'assets' and public.is_admin())
    with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists assets_admin_delete on storage.objects;
create policy assets_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'assets' and public.is_admin());

-- ============================================================================
-- 4. report-attachments — la DesktopApp carica, solo l'admin rilegge
-- ============================================================================
-- L'app (anon) puo' SOLO inserire: non puo' elencare ne' leggere gli allegati
-- altrui. La lettura e' riservata all'admin per la dashboard.
drop policy if exists report_attach_anon_insert on storage.objects;
create policy report_attach_anon_insert on storage.objects
    for insert to anon, authenticated
    with check (bucket_id = 'report-attachments');

drop policy if exists report_attach_admin_read on storage.objects;
create policy report_attach_admin_read on storage.objects
    for select to authenticated
    using (bucket_id = 'report-attachments' and public.is_admin());

drop policy if exists report_attach_admin_delete on storage.objects;
create policy report_attach_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'report-attachments' and public.is_admin());

-- ============================================================================
-- 5. unlocks — l'admin carica, l'utente legge solo i propri
-- ============================================================================
drop policy if exists unlocks_admin_insert on storage.objects;
create policy unlocks_admin_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'unlocks' and public.is_admin());

drop policy if exists unlocks_admin_update on storage.objects;
create policy unlocks_admin_update on storage.objects
    for update to authenticated
    using (bucket_id = 'unlocks' and public.is_admin())
    with check (bucket_id = 'unlocks' and public.is_admin());

drop policy if exists unlocks_admin_delete on storage.objects;
create policy unlocks_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'unlocks' and public.is_admin());

-- La prima cartella del path e' l'email del proprietario: <email>/<file>.lks
drop policy if exists unlocks_owner_select on storage.objects;
create policy unlocks_owner_select on storage.objects
    for select to authenticated
    using (
      bucket_id = 'unlocks'
      and ((storage.foldername(name))[1] = public.current_email() or public.is_admin())
    );

-- ============================================================================
-- Fine 0006_storage.sql
-- ============================================================================
