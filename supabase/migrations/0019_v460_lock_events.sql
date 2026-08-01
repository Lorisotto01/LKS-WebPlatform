-- ============================================================================
-- 0019_v460_lock_events.sql
--
-- v4.6.0 — Tracciamento server-side dei blocchi (ENV_LOCK / PERMANENT_LOCK).
--
-- Quando la DesktopApp entra in blocco genera un record qui. Se offline, il
-- client accoda l'evento e lo risincronizza alla riconnessione (idempotenza via
-- client_event_id). All'avvio la DesktopApp interroga active_lock_type(hwid): se
-- esiste un blocco non risolto, resta bloccata anche se il file environment.lks
-- locale è stato ripristinato/manomesso. Alla risoluzione di un blocco (sblocco
-- valido) la DesktopApp chiama resolve_locks(hwid).
--
-- Idempotente.
-- ============================================================================

create table if not exists public.lock_events (
    id               uuid primary key default gen_random_uuid(),
    hwid             text not null,
    email            text,
    lock_type        text not null check (lock_type in ('env', 'perm')),
    app_version      text,
    client_event_id  text unique,          -- generato dal client → idempotenza offline
    occurred_at      timestamptz not null default now(),
    resolved         boolean not null default false,
    resolved_at      timestamptz,
    created_at       timestamptz not null default now()
);

create index if not exists idx_lock_events_hwid on public.lock_events(hwid);
create index if not exists idx_lock_events_open on public.lock_events(hwid, resolved);

comment on table public.lock_events is
  'Eventi di blocco (ENV/PERM) dei dispositivi. Alimentati dalla DesktopApp (anche in differita se offline).';

alter table public.lock_events enable row level security;

-- Lettura: admin tutto; l'utente i propri (per email).
drop policy if exists lock_events_select on public.lock_events;
create policy lock_events_select on public.lock_events
  for select to authenticated
  using (public.is_admin() or (email is not null and email = public.current_email()));

-- ----------------------------------------------------------------------------
-- report_lock — la DesktopApp segnala un blocco. Public (chiamata con anon key,
-- come le RPC di attivazione). Idempotente sul client_event_id.
-- ----------------------------------------------------------------------------
create or replace function public.report_lock(
    p_hwid            text,
    p_lock_type       text,
    p_email           text default null,
    p_app_version     text default null,
    p_client_event_id text default null,
    p_occurred_at     timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_hwid is null or p_hwid = '' or p_lock_type not in ('env', 'perm') then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;

  insert into public.lock_events (hwid, email, lock_type, app_version, client_event_id, occurred_at)
  values (p_hwid, nullif(p_email, ''), p_lock_type, p_app_version,
          nullif(p_client_event_id, ''), coalesce(p_occurred_at, now()))
  on conflict (client_event_id) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.report_lock(text, text, text, text, text, timestamptz) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- active_lock_type — tipo del blocco NON risolto più recente per un HWID, o null.
-- Serve alla DesktopApp per ri-bloccarsi anche dopo un ripristino locale del file.
-- ----------------------------------------------------------------------------
create or replace function public.active_lock_type(p_hwid text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lock_type
    from public.lock_events
   where hwid = p_hwid and not resolved
   order by occurred_at desc
   limit 1;
$$;

grant execute on function public.active_lock_type(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- resolve_locks — segna risolti i blocchi di un HWID (dopo uno sblocco valido).
-- Public: non concede accesso locale (il device resta bloccato finché non passa
-- lo sblocco locale vero: master password o unlock.lks firmato).
-- ----------------------------------------------------------------------------
create or replace function public.resolve_locks(p_hwid text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.lock_events
     set resolved = true, resolved_at = now()
   where hwid = p_hwid and not resolved;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.resolve_locks(text) to anon, authenticated;

-- ============================================================================
-- Fine 0019_v460_lock_events.sql
-- ============================================================================
