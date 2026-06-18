-- ============================================================================
-- LKS v4.0.6 — Lock/Unlock: binding HWID + flag stato (parte WebPlatform).
--
-- Modello: ogni download genera un `activation_token` (stato 'pending') legato
-- all'email. Al PRIMO AVVIO la DesktopApp invia l'HWID e fa il binding
-- (status -> 'active'). Il Tool-CLI potra validare la licenza (stub pronto).
--
-- Gli "endpoint" sono funzioni RPC (PostgREST), chiamabili in HTTP POST da
-- client esterni (DesktopApp / Tool-CLI) con l'apikey pubblica. Sono
-- SECURITY DEFINER: la logica privilegiata sta nel DB, non nel client.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tabella activations
-- ----------------------------------------------------------------------------
create table if not exists public.activations (
    id               uuid primary key default gen_random_uuid(),
    email            text not null references public.registrations(email) on delete cascade,
    activation_token uuid not null unique default gen_random_uuid(),
    hwid             text,                         -- valorizzato al primo avvio (binding)
    status           text not null default 'pending'
                       check (status in ('pending', 'active', 'suspended')),
    app_version      text,
    created_at       timestamptz not null default now(),
    activated_at     timestamptz                   -- settato al binding HWID
);

create index if not exists idx_activations_email on public.activations(email);
create index if not exists idx_activations_token on public.activations(activation_token);

alter table public.activations enable row level security;

-- L'utente loggato vede SOLO le proprie attivazioni.
drop policy if exists activations_select_owner on public.activations;
create policy activations_select_owner on public.activations
    for select to authenticated
    using (email = public.current_email());

-- L'utente loggato crea attivazioni solo per la propria email (il token e il
-- default dalla colonna). Il binding HWID NON avviene qui: lo fa la RPC.
drop policy if exists activations_insert_self on public.activations;
create policy activations_insert_self on public.activations
    for insert to authenticated
    with check (email = public.current_email());

-- L'admin (vedi 0004) puo leggere/aggiornare tutto: sospensione, re-bind, ops.
drop policy if exists activations_admin_all on public.activations;
create policy activations_admin_all on public.activations
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ============================================================================
-- RPC 1 — bind_activation  ( = POST /api/activations )
-- Chiamata dalla DesktopApp al primo avvio: collega l'HWID al token.
-- URL:  POST https://<project>.supabase.co/rest/v1/rpc/bind_activation
-- Body: { "p_token": "...", "p_email": "...", "p_hwid": "...", "p_app_version": "..." }
-- Idempotente: richiamarla con lo stesso HWID non cambia nulla.
-- Collisione HWID diverso => rifiuto (re-bind solo via admin che azzera l'hwid).
-- ============================================================================
create or replace function public.bind_activation(
    p_token       uuid,
    p_email       text,
    p_hwid        text,
    p_app_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.activations;
begin
  select * into r from public.activations
   where activation_token = p_token and email = p_email;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_not_found');
  end if;

  if r.status = 'suspended' then
    return jsonb_build_object('ok', false, 'error', 'suspended', 'status', r.status);
  end if;

  if r.hwid is null then
    -- primo binding
    update public.activations
       set hwid = p_hwid, status = 'active', activated_at = now(),
           app_version = coalesce(p_app_version, app_version)
     where id = r.id
     returning * into r;
  elsif r.hwid = p_hwid then
    -- stesso dispositivo: idempotente (aggiorno solo l'eventuale versione)
    update public.activations
       set app_version = coalesce(p_app_version, app_version)
     where id = r.id
     returning * into r;
  else
    -- dispositivo diverso sullo stesso token: rifiuto
    return jsonb_build_object('ok', false, 'error', 'hwid_mismatch', 'status', r.status);
  end if;

  return jsonb_build_object(
    'ok', true, 'status', r.status, 'email', r.email,
    'token', r.activation_token, 'hwid', r.hwid, 'activatedAt', r.activated_at);
end;
$$;

grant execute on function public.bind_activation(uuid, text, text, text) to anon, authenticated;

-- ============================================================================
-- RPC 2 — validate_license  ( = POST /api/license/validate )  [STUB future-ready]
-- Pronta ma NON ancora obbligatoria nel flusso (il Tool-CLI la usera con --validate).
-- URL:  POST https://<project>.supabase.co/rest/v1/rpc/validate_license
-- Body: { "p_token": "...", "p_email": "...", "p_hwid": "..." }
-- active = (record esiste && hwid combacia && status = 'active')
-- ============================================================================
create or replace function public.validate_license(
    p_token uuid,
    p_email text,
    p_hwid  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.activations;
begin
  select * into r from public.activations
   where activation_token = p_token and email = p_email;

  if not found then
    return jsonb_build_object('active', false, 'status', 'unknown',
      'email', p_email, 'token', p_token, 'hwid', p_hwid);
  end if;

  return jsonb_build_object(
    'active', (r.hwid is not distinct from p_hwid and r.status = 'active'),
    'status', r.status, 'email', r.email, 'token', r.activation_token, 'hwid', r.hwid);
end;
$$;

grant execute on function public.validate_license(uuid, text, text) to anon, authenticated;

-- ============================================================================
-- OPS — sospendere/riattivare un'attivazione (admin, o manualmente in SQL):
--   update public.activations set status = 'suspended' where email = '...';
--   update public.activations set status = 'active'    where email = '...';
-- Re-bind di un nuovo dispositivo (azzera l'HWID, poi la DesktopApp ribinda):
--   update public.activations set hwid = null, status = 'pending' where activation_token = '...';
-- ============================================================================
