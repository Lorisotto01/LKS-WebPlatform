-- ============================================================================
-- v4.3.1 — Segnalazioni (reports).
--
-- Flusso: le segnalazioni vengono APERTE dalla DesktopApp (con apikey anon, come
-- le RPC di attivazione) e GESTITE dall'admin nel pannello /admin della WebPlatform.
-- Stati: aperta -> in_lavorazione -> chiusa. Tipi: bug | idea | altro.
--
-- Contratto condiviso con la DesktopApp (altra lavorazione):
--   - open_report(...)       apre una segnalazione (anon/authenticated)
--   - list_my_reports(...)   elenca le segnalazioni del dispositivo (anon/authenticated)
--   - release_download_counts() conteggi download per versione (solo admin)
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tabella reports
-- ----------------------------------------------------------------------------
create table if not exists public.reports (
    id           uuid primary key default gen_random_uuid(),
    email        text,                                  -- segnalatore (no FK: la segnalazione sopravvive all'account)
    hwid         text,                                  -- dispositivo che ha aperto la segnalazione
    tipo         text not null default 'bug'
                   check (tipo in ('bug', 'idea', 'altro')),
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

-- Solo l'admin (vedi is_admin() in 0004) legge/aggiorna/elimina tutte le segnalazioni.
-- L'inserimento avviene SOLO via RPC SECURITY DEFINER (open_report), quindi nessuna
-- policy di insert per gli utenti: gli anon/authenticated non scrivono direttamente.
drop policy if exists reports_admin_all on public.reports;
create policy reports_admin_all on public.reports
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- Mantiene updated_at coerente ad ogni UPDATE.
create or replace function public.reports_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_reports_touch on public.reports;
create trigger trg_reports_touch before update on public.reports
  for each row execute function public.reports_touch_updated_at();

-- ============================================================================
-- RPC 1 — open_report  ( aperta dalla DesktopApp )
--   POST /rest/v1/rpc/open_report
--   { p_email, p_hwid, p_tipo, p_titolo, p_descrizione, p_app_version }
-- ============================================================================
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
    case when p_tipo in ('bug', 'idea', 'altro') then p_tipo else 'bug' end,
    btrim(p_titolo),
    nullif(btrim(p_descrizione), ''),
    nullif(btrim(p_app_version), '')
  )
  returning * into r;

  return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status, 'createdAt', r.created_at);
end;
$$;

grant execute on function public.open_report(text, text, text, text, text, text) to anon, authenticated;

-- ============================================================================
-- RPC 2 — list_my_reports  ( elenco segnalazioni del dispositivo, per la DesktopApp )
--   POST /rest/v1/rpc/list_my_reports  { p_email, p_hwid }
--   Ritorna le segnalazioni che combaciano per hwid OPPURE email (almeno uno richiesto).
-- ============================================================================
create or replace function public.list_my_reports(
    p_email text default null,
    p_hwid  text default null
) returns setof public.reports
language sql
security definer
set search_path = public
as $$
  select *
    from public.reports
   where (p_hwid  is not null and hwid  = p_hwid)
      or (p_email is not null and email = p_email)
   order by created_at desc;
$$;

grant execute on function public.list_my_reports(text, text) to anon, authenticated;

-- ============================================================================
-- RPC 3 — release_download_counts  ( indicatore download per versione, solo admin )
--   Aggrega public.downloads (che gli utenti non-admin non possono leggere via RLS).
-- ============================================================================
create or replace function public.release_download_counts()
returns table (version text, total bigint, unique_users bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select d.version, count(*)::bigint, count(distinct d.email)::bigint
      from public.downloads d
     group by d.version;
end;
$$;

grant execute on function public.release_download_counts() to authenticated;
