-- ============================================================================
-- Diagnostica upload allegati segnalazioni (HTTP 400 in upload dalla DesktopApp)
-- Esegui questo file nel SQL Editor di Supabase (gira come ruolo "postgres",
-- proprietario di storage.objects: i CREATE POLICY qui sotto funzionano).
-- ============================================================================

-- 1) Il bucket esiste?  (atteso: 1 riga, public = false)
select id, public
from storage.buckets
where id = 'report-attachments';

-- 2) Le policy storage per il bucket esistono?  (atteso: almeno report_attach_anon_insert)
select policyname, cmd, roles, with_check, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'report_attach%'
order by policyname;

-- Se la query (2) NON mostra "report_attach_anon_insert", la causa del 400 è
-- la policy di INSERT mancante. Riapplicala eseguendo il blocco seguente.

-- ----------------------------------------------------------------------------
-- RIPRISTINO policy storage (idempotente)
-- ----------------------------------------------------------------------------
-- assicura il bucket
insert into storage.buckets (id, name, public)
values ('report-attachments', 'report-attachments', false)
on conflict (id) do nothing;

-- INSERT anonimo (l'app carica con la publishable key, ruolo anon)
drop policy if exists report_attach_anon_insert on storage.objects;
create policy report_attach_anon_insert on storage.objects
    for insert to anon, authenticated
    with check (bucket_id = 'report-attachments');

-- lettura/eliminazione solo admin (per la dashboard)
drop policy if exists report_attach_admin_read on storage.objects;
create policy report_attach_admin_read on storage.objects
    for select to authenticated
    using (bucket_id = 'report-attachments' and public.is_admin());

drop policy if exists report_attach_admin_delete on storage.objects;
create policy report_attach_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'report-attachments' and public.is_admin());

-- 3) Verifica finale: ri-esegui la query (2). Ora deve comparire report_attach_anon_insert.
