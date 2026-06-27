-- ============================================================================
-- v4.3.5 — Migliorie Report Issue.
--
-- Cosa cambia (vedi ClickUp 869dve3bu):
--   1. Tipologia segnalazione: 'idea' -> 'implementazione'. Le tre tipologie
--      diventano: bug | implementazione | altro. I dati storici vengono migrati.
--   2. Allegati: gli utenti possono caricare uno screenshot quando aprono una
--      segnalazione dalla DesktopApp. I file vivono nel bucket privato
--      'report-attachments'; i metadati in public.report_attachments.
--
-- Contratto condiviso con la DesktopApp (anon key, come 0009):
--   - open_report(...)          apertura segnalazione (ora accetta 'implementazione')
--   - attach_report_file(...)   registra un allegato caricato su storage (NEW)
--   - list_my_reports(...)      ora include gli allegati per ogni segnalazione
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tipologia: idea -> implementazione
-- ----------------------------------------------------------------------------
-- Rimuovo il vecchio CHECK, migro i dati, riapplico il nuovo CHECK.
alter table public.reports drop constraint if exists reports_tipo_check;

update public.reports set tipo = 'implementazione' where tipo = 'idea';

alter table public.reports
    add constraint reports_tipo_check
    check (tipo in ('bug', 'implementazione', 'altro'));

-- ----------------------------------------------------------------------------
-- 2) Tabella allegati
-- ----------------------------------------------------------------------------
create table if not exists public.report_attachments (
    id           uuid primary key default gen_random_uuid(),
    report_id    uuid not null references public.reports(id) on delete cascade,
    path         text not null,                 -- object path nel bucket 'report-attachments'
    filename     text,
    content_type text,
    size_bytes   bigint,
    created_at   timestamptz not null default now()
);

create index if not exists idx_report_attachments_report
    on public.report_attachments(report_id);

alter table public.report_attachments enable row level security;

-- Solo l'admin legge/gestisce i metadati degli allegati (come per reports).
-- L'inserimento avviene SOLO via RPC SECURITY DEFINER (attach_report_file).
drop policy if exists report_attachments_admin_all on public.report_attachments;
create policy report_attachments_admin_all on public.report_attachments
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3) Bucket storage 'report-attachments' (privato)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('report-attachments', 'report-attachments', false)
on conflict (id) do nothing;

-- L'app (anon) puo solo INSERIRE oggetti nel bucket: non puo elencare ne leggere.
drop policy if exists report_attach_anon_insert on storage.objects;
create policy report_attach_anon_insert on storage.objects
    for insert to anon, authenticated
    with check (bucket_id = 'report-attachments');

-- L'admin (autenticato) puo leggere/eliminare gli allegati per la dashboard.
drop policy if exists report_attach_admin_read on storage.objects;
create policy report_attach_admin_read on storage.objects
    for select to authenticated
    using (bucket_id = 'report-attachments' and public.is_admin());

drop policy if exists report_attach_admin_delete on storage.objects;
create policy report_attach_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'report-attachments' and public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) RPC open_report — aggiornata per accettare 'implementazione'
-- ----------------------------------------------------------------------------
create or replace function public.open_report(
    p_titolo      text,
    p_descrizione text default null,
    p_tipo        text default 'bug',
    p_email       text default null,
    p_hwid        text default null,
    p_app_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.reports;
begin
  if p_titolo is null or length(btrim(p_titolo)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'titolo_required');
  end if;

  insert into public.reports (email, hwid, tipo, titolo, descrizione, app_version)
  values (
    nullif(btrim(p_email), ''),
    nullif(btrim(p_hwid), ''),
    case when p_tipo in ('bug', 'implementazione', 'altro') then p_tipo else 'bug' end,
    btrim(p_titolo),
    nullif(btrim(p_descrizione), ''),
    nullif(btrim(p_app_version), '')
  )
  returning * into r;

  return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status, 'createdAt', r.created_at);
end;
$$;

grant execute on function public.open_report(text, text, text, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC attach_report_file — registra un allegato caricato su storage
--   POST /rest/v1/rpc/attach_report_file
--   { p_report_id, p_path, p_filename, p_content_type, p_size }
--   Guardia: il path deve trovarsi nella "cartella" della segnalazione
--   (p_report_id/...) per evitare che un client registri path arbitrari.
-- ----------------------------------------------------------------------------
create or replace function public.attach_report_file(
    p_report_id    uuid,
    p_path         text,
    p_filename     text default null,
    p_content_type text default null,
    p_size         bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.report_attachments;
begin
  if p_report_id is null or p_path is null or length(btrim(p_path)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;
  if not exists (select 1 from public.reports where id = p_report_id) then
    return jsonb_build_object('ok', false, 'error', 'report_not_found');
  end if;
  -- il path deve appartenere alla cartella della segnalazione
  if position(p_report_id::text || '/' in p_path) <> 1 then
    return jsonb_build_object('ok', false, 'error', 'path_mismatch');
  end if;

  insert into public.report_attachments (report_id, path, filename, content_type, size_bytes)
  values (p_report_id, btrim(p_path), nullif(btrim(p_filename), ''),
          nullif(btrim(p_content_type), ''), p_size)
  returning * into a;

  return jsonb_build_object('ok', true, 'id', a.id);
end;
$$;

grant execute on function public.attach_report_file(uuid, text, text, text, bigint) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC list_my_reports — ora include gli allegati
--   Cambia il tipo di ritorno (setof reports -> jsonb), quindi va ricreata.
-- ----------------------------------------------------------------------------
drop function if exists public.list_my_reports(text, text);

create or replace function public.list_my_reports(
    p_email text default null,
    p_hwid  text default null
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(q order by q.created_at desc), '[]'::jsonb)
  from (
    select
      r.id, r.tipo, r.titolo, r.descrizione, r.app_version,
      r.status, r.admin_note, r.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', a.id, 'path', a.path, 'filename', a.filename,
                 'content_type', a.content_type, 'size_bytes', a.size_bytes)
               order by a.created_at)
        from public.report_attachments a
        where a.report_id = r.id
      ), '[]'::jsonb) as attachments
    from public.reports r
    where (p_hwid  is not null and r.hwid  = p_hwid)
       or (p_email is not null and r.email = p_email)
  ) q;
$$;

grant execute on function public.list_my_reports(text, text) to anon, authenticated;
