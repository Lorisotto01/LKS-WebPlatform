-- ============================================================================
-- 0004_support.sql — Segnalazioni e allegati.
--
-- Flusso: le segnalazioni sono APERTE dalla DesktopApp (apikey anon, come le RPC
-- di attivazione) e GESTITE dall'admin in /admin/segnalazioni.
--   stati: aperta -> in_lavorazione -> chiusa
--   tipi:  bug | implementazione | altro
--
-- Contratto condiviso con la DesktopApp:
--   open_report(...)        apre una segnalazione
--   attach_report_file(...) registra un allegato caricato su storage
--   list_my_reports(...)    elenca le segnalazioni del dispositivo + allegati
--
-- Idempotente.
-- ============================================================================

-- ============================================================================
-- 1. SEGNALAZIONI
-- ============================================================================
-- Nessuna FK su email: la segnalazione sopravvive alla cancellazione dell'account.
create table if not exists public.reports (
    id           uuid primary key default gen_random_uuid(),
    email        text,
    hwid         text,
    tipo         text not null default 'bug'
                   check (tipo in ('bug', 'implementazione', 'altro')),
    titolo       text not null,
    descrizione  text,
    app_version  text,
    status       text not null default 'aperta'
                   check (status in ('aperta', 'in_lavorazione', 'chiusa')),
    admin_note   text,                                  -- nota interna dell'admin
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists idx_reports_status  on public.reports(status);
create index if not exists idx_reports_hwid    on public.reports(hwid);
create index if not exists idx_reports_created on public.reports(created_at desc);

alter table public.reports enable row level security;

-- Solo l'admin legge/aggiorna/elimina. L'inserimento passa SOLO dalla RPC
-- SECURITY DEFINER open_report: nessuna policy di insert per gli utenti.
drop policy if exists reports_admin_all on public.reports;
create policy reports_admin_all on public.reports
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

create or replace function public.reports_touch_updated_at()
returns trigger language plpgsql as $fn$
begin new.updated_at := now(); return new; end;
$fn$;

drop trigger if exists trg_reports_touch on public.reports;
create trigger trg_reports_touch before update on public.reports
  for each row execute function public.reports_touch_updated_at();

-- ============================================================================
-- 2. ALLEGATI
-- ============================================================================
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

drop policy if exists report_attachments_admin_all on public.report_attachments;
create policy report_attachments_admin_all on public.report_attachments
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 3. RPC
-- ============================================================================

-- open_report — POST /rest/v1/rpc/open_report
create or replace function public.open_report(
    p_titolo      text,
    p_descrizione text default null,
    p_tipo        text default 'bug',
    p_email       text default null,
    p_hwid        text default null,
    p_app_version text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
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

  return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status,
                            'createdAt', r.created_at);
end;
$fn$;

grant execute on function public.open_report(text, text, text, text, text, text) to anon, authenticated;

-- attach_report_file — registra un allegato gia' caricato su storage.
-- Guardia: il path deve stare nella cartella della segnalazione (<report_id>/...)
-- per impedire a un client di registrare percorsi arbitrari.
create or replace function public.attach_report_file(
    p_report_id    uuid,
    p_path         text,
    p_filename     text default null,
    p_content_type text default null,
    p_size         bigint default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare a public.report_attachments;
begin
  if p_report_id is null or p_path is null or length(btrim(p_path)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;
  if not exists (select 1 from public.reports where id = p_report_id) then
    return jsonb_build_object('ok', false, 'error', 'report_not_found');
  end if;
  if position(p_report_id::text || '/' in p_path) <> 1 then
    return jsonb_build_object('ok', false, 'error', 'path_mismatch');
  end if;

  insert into public.report_attachments (report_id, path, filename, content_type, size_bytes)
  values (p_report_id, btrim(p_path), nullif(btrim(p_filename), ''),
          nullif(btrim(p_content_type), ''), p_size)
  returning * into a;

  return jsonb_build_object('ok', true, 'id', a.id);
end;
$fn$;

grant execute on function public.attach_report_file(uuid, text, text, text, bigint) to anon, authenticated;

-- list_my_reports — segnalazioni del dispositivo/email, con allegati annidati.
-- Ritorna jsonb (non setof reports): rimuove ogni firma precedente per sicurezza.
drop function if exists public.list_my_reports(text, text);

create or replace function public.list_my_reports(
    p_email text default null,
    p_hwid  text default null
) returns jsonb
language sql security definer set search_path = public as $fn$
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
$fn$;

grant execute on function public.list_my_reports(text, text) to anon, authenticated;

-- ============================================================================
-- Fine 0004_support.sql
-- ============================================================================
