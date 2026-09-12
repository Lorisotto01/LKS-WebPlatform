-- ============================================================================
-- 0003_licensing.sql — Attivazioni, licenze e blocchi dei dispositivi.
--
--   * activations  — una licenza per dispositivo: token + binding HWID
--   * lock_events  — blocchi ENV/PERM segnalati dalla DesktopApp
--
-- Gli "endpoint" sono RPC PostgREST chiamabili in POST con la sola apikey
-- pubblica (anon) da DesktopApp e Tool-CLI. Sono SECURITY DEFINER: la logica
-- privilegiata sta nel DB, mai nel client.
--
--   bind_activation(...)    primo avvio: lega l'HWID al token
--   validate_license(...)   controllo periodico/at-boot + sync versione
--   revoke_activation(...)  l'utente revoca un proprio dispositivo
--   effective_plan_info(..) piano effettivo, con declassamento a scadenza
--   report_lock(...)        la DesktopApp segnala un blocco
--   active_lock_type(...)   blocco non risolto piu' recente per un HWID
--   resolve_locks(...)      segna risolti i blocchi di un HWID
--
-- Dipende da 0002 perche' effective_plan_info() legge public.subscriptions.
-- Idempotente.
-- ============================================================================

-- ============================================================================
-- 1. ATTIVAZIONI
-- ============================================================================
-- Stati:
--   pending   -> creata, non ancora legata a un dispositivo
--   active    -> attiva e legata all'HWID
--   revoked   -> revocata dall'utente: la DesktopApp si blocca PRIMA del login
--   suspended -> sospensione lato autore (admin)
create table if not exists public.activations (
    id               uuid primary key default gen_random_uuid(),
    email            text not null references public.registrations(email) on delete cascade,
    activation_token uuid not null unique default gen_random_uuid(),
    hwid             text,                         -- valorizzato al primo avvio
    status           text not null default 'pending'
                       check (status in ('pending', 'active', 'revoked', 'suspended')),
    app_version      text,
    created_at       timestamptz not null default now(),
    activated_at     timestamptz
);

create index if not exists idx_activations_email on public.activations(email);
create index if not exists idx_activations_token on public.activations(activation_token);

alter table public.activations enable row level security;

drop policy if exists activations_select_owner on public.activations;
create policy activations_select_owner on public.activations
    for select to authenticated
    using (email = public.current_email());

drop policy if exists activations_insert_self on public.activations;
create policy activations_insert_self on public.activations
    for insert to authenticated
    with check (email = public.current_email());

-- L'admin puo' leggere/aggiornare tutto: sospensione, re-bind, ops.
drop policy if exists activations_admin_all on public.activations;
create policy activations_admin_all on public.activations
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 2. EVENTI DI BLOCCO
-- ============================================================================
-- Se la DesktopApp e' offline accoda l'evento e lo risincronizza dopo:
-- client_event_id garantisce l'idempotenza. All'avvio l'app interroga
-- active_lock_type(hwid): se c'e' un blocco non risolto resta bloccata anche se
-- il file environment.lks locale e' stato ripristinato o manomesso.
create table if not exists public.lock_events (
    id               uuid primary key default gen_random_uuid(),
    hwid             text not null,
    email            text,
    lock_type        text not null check (lock_type in ('env', 'perm')),
    app_version      text,
    client_event_id  text unique,          -- generato dal client -> idempotenza offline
    occurred_at      timestamptz not null default now(),
    resolved         boolean not null default false,
    resolved_at      timestamptz,
    created_at       timestamptz not null default now()
);

create index if not exists idx_lock_events_hwid on public.lock_events(hwid);
create index if not exists idx_lock_events_open on public.lock_events(hwid, resolved);

comment on table public.lock_events is
  'Eventi di blocco (ENV/PERM) dei dispositivi, alimentati dalla DesktopApp.';

alter table public.lock_events enable row level security;

drop policy if exists lock_events_select on public.lock_events;
create policy lock_events_select on public.lock_events
  for select to authenticated
  using (public.is_admin() or (email is not null and email = public.current_email()));

-- ============================================================================
-- 3. PIANO EFFETTIVO
-- ============================================================================
-- Calcola il piano reale di un'email e, se l'abbonamento e' scaduto, declassa a
-- 'free' (idempotente): registrations.plan torna free e la subscription passa a
-- 'expired'. Cosi' l'app, al primo avvio online dopo la scadenza, riceve 'free'
-- e blocca le funzionalita' a pagamento.
create or replace function public.effective_plan_info(p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_reg_plan text;
  s          public.subscriptions;
  v_cycle    text;
  v_renew    text;
begin
  select plan into v_reg_plan from public.registrations where email = p_email;
  v_reg_plan := coalesce(v_reg_plan, 'free');

  select * into s from public.subscriptions where email = p_email;

  -- Nessun abbonamento tracciato -> si usa registrations.plan cosi' com'e'.
  if not found then
    return jsonb_build_object('plan', v_reg_plan, 'billingCycle', null, 'renewalEstimate', null);
  end if;

  v_cycle := case s.billing_cycle when 'year' then 'annuale'
                                 when 'month' then 'mensile' else null end;
  v_renew := to_char(s.current_period_end, 'YYYY-MM-DD');

  -- Scaduto -> declassa a free.
  if s.current_period_end is not null and s.current_period_end < now() then
    if v_reg_plan <> 'free' then
      update public.registrations set plan = 'free' where email = p_email;
    end if;
    if s.status = 'active' then
      update public.subscriptions set status = 'expired', updated_at = now()
       where email = p_email;
    end if;
    return jsonb_build_object('plan', 'free', 'billingCycle', null, 'renewalEstimate', null);
  end if;

  if s.status = 'active' then
    return jsonb_build_object('plan', s.plan_code, 'billingCycle', v_cycle,
                              'renewalEstimate', v_renew);
  end if;

  -- canceled / expired -> free.
  return jsonb_build_object('plan', 'free', 'billingCycle', null, 'renewalEstimate', null);
end;
$fn$;

grant execute on function public.effective_plan_info(text) to anon, authenticated;

-- ============================================================================
-- 4. RPC DI LICENZA
-- ============================================================================

-- Rimuove esplicitamente eventuali firme storiche prima di ricreare, cosi' lo
-- script resta applicabile anche su un database non azzerato.
drop function if exists public.bind_activation(uuid, text, text);
drop function if exists public.validate_license(uuid, text, text);

-- bind_activation — POST /rest/v1/rpc/bind_activation
--   { p_token, p_email, p_hwid, p_app_version }
-- Idempotente sullo stesso HWID; un HWID diverso sullo stesso token e' rifiutato
-- (il re-bind lo fa l'admin azzerando hwid). Una licenza revocata non e' ri-bindabile.
create or replace function public.bind_activation(
    p_token       uuid,
    p_email       text,
    p_hwid        text,
    p_app_version text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r    public.activations;
  info jsonb;
begin
  select * into r from public.activations
   where activation_token = p_token and email = p_email;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_not_found');
  end if;
  if r.status = 'suspended' then
    return jsonb_build_object('ok', false, 'error', 'suspended', 'status', r.status);
  end if;
  if r.status = 'revoked' then
    return jsonb_build_object('ok', false, 'error', 'revoked', 'status', r.status);
  end if;

  if r.hwid is null then
    -- primo binding
    update public.activations
       set hwid = p_hwid, status = 'active', activated_at = now(),
           app_version = coalesce(p_app_version, app_version)
     where id = r.id returning * into r;
  elsif r.hwid = p_hwid then
    -- stesso dispositivo: aggiorno solo l'eventuale versione
    update public.activations
       set app_version = coalesce(p_app_version, app_version)
     where id = r.id returning * into r;
  else
    return jsonb_build_object('ok', false, 'error', 'hwid_mismatch', 'status', r.status);
  end if;

  -- L'HWID vive UNICAMENTE in activations.hwid: e' la fonte di verita' del binding.
  info := public.effective_plan_info(p_email);

  return jsonb_build_object(
    'ok', true, 'status', r.status, 'email', r.email,
    'token', r.activation_token, 'hwid', r.hwid, 'activatedAt', r.activated_at,
    'plan',            info->>'plan',
    'billingCycle',    info->>'billingCycle',
    'renewalEstimate', info->>'renewalEstimate');
end;
$fn$;

grant execute on function public.bind_activation(uuid, text, text, text) to anon, authenticated;

-- validate_license — controllo at-boot/periodico. p_app_version sincronizza la
-- versione attiva dopo un aggiornamento. Qui avviene il declassamento a scadenza.
create or replace function public.validate_license(
    p_token       uuid,
    p_email       text,
    p_hwid        text,
    p_app_version text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r    public.activations;
  info jsonb;
begin
  select * into r from public.activations
   where activation_token = p_token and email = p_email;

  if not found then
    return jsonb_build_object('active', false, 'status', 'unknown',
      'email', p_email, 'token', p_token, 'hwid', p_hwid);
  end if;

  if p_app_version is not null and r.hwid is not distinct from p_hwid
     and r.status = 'active' then
    update public.activations set app_version = p_app_version
     where id = r.id returning * into r;
  end if;

  info := public.effective_plan_info(p_email);

  return jsonb_build_object(
    'active', (r.hwid is not distinct from p_hwid and r.status = 'active'),
    'status', r.status, 'email', r.email, 'token', r.activation_token,
    'hwid', r.hwid,
    'plan',            info->>'plan',
    'billingCycle',    info->>'billingCycle',
    'renewalEstimate', info->>'renewalEstimate');
end;
$fn$;

grant execute on function public.validate_license(uuid, text, text, text) to anon, authenticated;

-- revoke_activation — revoca BLOCCANTE dal pannello WebPlatform.
-- hwid e token restano: al prossimo validate_license la DesktopApp riceve
-- 'revoked' e si blocca prima del login. Per riusare il dispositivo l'utente
-- genera una nuova attivazione (nuovo token, riga 'pending').
create or replace function public.revoke_activation(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare r public.activations;
begin
  select * into r from public.activations
   where id = p_id and email = public.current_email();

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.activations set status = 'revoked'
   where id = r.id returning * into r;

  return jsonb_build_object('ok', true, 'status', r.status, 'hwid', r.hwid);
end;
$fn$;

grant execute on function public.revoke_activation(uuid) to authenticated;

-- ============================================================================
-- 5. RPC DI BLOCCO
-- ============================================================================

-- Firma storica con timestamptz rimossa: PostgREST risolve le funzioni per nome
-- + nomi-argomento e puo' rifiutare (404/400) un timestamptz passato come
-- stringa. p_occurred_at e' TEXT e viene castato internamente.
drop function if exists public.report_lock(text, text, text, text, text, timestamptz);

create or replace function public.report_lock(
    p_hwid            text,
    p_lock_type       text,
    p_email           text default null,
    p_app_version     text default null,
    p_client_event_id text default null,
    p_occurred_at     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_ts timestamptz;
begin
  if p_hwid is null or p_hwid = '' or p_lock_type not in ('env', 'perm') then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;

  begin
    v_ts := coalesce(nullif(p_occurred_at, '')::timestamptz, now());
  exception when others then
    v_ts := now();   -- data non valida -> adesso
  end;

  insert into public.lock_events (hwid, email, lock_type, app_version, client_event_id, occurred_at)
  values (p_hwid, nullif(p_email, ''), p_lock_type, p_app_version,
          nullif(p_client_event_id, ''), v_ts)
  on conflict (client_event_id) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;

grant execute on function public.report_lock(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.active_lock_type(p_hwid text)
returns text
language sql stable security definer set search_path = public as $fn$
  select lock_type
    from public.lock_events
   where hwid = p_hwid and not resolved
   order by occurred_at desc
   limit 1;
$fn$;

grant execute on function public.active_lock_type(text) to anon, authenticated;

-- Segna risolti i blocchi di un HWID dopo uno sblocco valido. Non concede
-- accesso locale: il device resta bloccato finche' non passa lo sblocco vero
-- (master password o unlock.lks firmato).
create or replace function public.resolve_locks(p_hwid text)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  update public.lock_events
     set resolved = true, resolved_at = now()
   where hwid = p_hwid and not resolved;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

grant execute on function public.resolve_locks(text) to anon, authenticated;

-- ============================================================================
-- Fine 0003_licensing.sql
-- ============================================================================
