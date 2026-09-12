-- ============================================================================
-- 0001_foundation.sql — Fondamenta dello schema.
--
-- Contiene tutto cio' da cui dipende il resto della catena:
--   * estensioni
--   * helper  current_email() e is_admin()   <- usati da quasi ogni policy
--   * catalogo piani (plans, plan_features)  <- referenziato da registrations
--   * anagrafica (registrations), audit download (downloads), release
--   * GDPR: delete_my_account(), purge_old_downloads() + retention
--
-- ORDINE OBBLIGATORIO: `plans` precede `registrations` perche' registrations.plan
-- ha una FK su plans(code) e il DEFAULT 'free' deve gia' esistere in catalogo.
--
-- Idempotente: rieseguibile senza errori.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. HELPER — devono esistere prima di qualunque policy che li usa.
-- ============================================================================

-- Email dell'utente autenticato, letta dai claim del JWT.
create or replace function public.current_email() returns text
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')
$fn$;

-- L'utente autenticato e' admin? Il ruolo vive in app_metadata, che NON e'
-- modificabile dal client (a differenza di user_metadata): nessuno puo'
-- auto-promuoversi dal browser. Si imposta con scripts/02_set_admin.sql.
create or replace function public.is_admin() returns boolean
language sql stable as $fn$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$fn$;

-- ============================================================================
-- 2. CATALOGO PIANI — prima di registrations (vincolo di FK).
-- ============================================================================

-- Prezzi in centesimi di euro (interi, mai float). max_* NULL = illimitato.
create table if not exists public.plans (
    code                text primary key check (code in ('free', 'essential', 'pro')),
    name                text    not null,
    tagline             text,
    price_month_cents   integer not null default 0 check (price_month_cents >= 0),
    price_year_cents    integer not null default 0 check (price_year_cents  >= 0),
    max_users           integer check (max_users   is null or max_users   > 0),
    max_folders         integer check (max_folders is null or max_folders > 0),
    max_upload_bytes    bigint  not null,
    env_lock_cents      integer not null,
    perm_lock_cents     integer not null,
    sort_order          integer not null default 0,
    is_recommended      boolean not null default false,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now()
);

comment on table public.plans is
  'Definizione piani (single source of truth). Prezzi in centesimi EUR; max_* NULL = illimitato.';

-- Matrice funzionalita' -> piano minimo che la sblocca. Base del gating lato
-- WebApp/DesktopApp e delle targhette ESSENTIAL/PRO.
create table if not exists public.plan_features (
    feature_key   text primary key,
    label         text not null,
    description   text,
    category      text not null default 'general',   -- password | localdrop | licensing | general
    min_plan      text not null references public.plans(code)
                    check (min_plan in ('free', 'essential', 'pro')),
    sort_order    integer not null default 0
);

comment on table public.plan_features is
  'Matrice feature -> piano minimo che la sblocca.';

-- Seed catalogo: NON e' contenuto editoriale ma configurazione commerciale, e
-- la riga 'free' e' un prerequisito del DEFAULT di registrations.plan.
insert into public.plans
  (code, name, tagline, price_month_cents, price_year_cents,
   max_users, max_folders, max_upload_bytes,
   env_lock_cents, perm_lock_cents, sort_order, is_recommended, is_active)
values
  ('free',      'Free',      'Per iniziare, sempre gratis',
      0,   0,     3,    3,    5368709120, 12000, 10000, 1, false, true),   --  5 GB
  ('essential', 'Essential', 'Piu'' spazio e collaborazione',
      499, 5000,  8,    null, 10737418240, 10200, 6500, 2, true,  true),   -- 10 GB
  ('pro',       'Pro',       'Nessun limite, massima potenza',
      999, 10000, null, null, 21474836480, 6000, 1000, 3, false, true)     -- 20 GB
on conflict (code) do update set
  name              = excluded.name,
  tagline           = excluded.tagline,
  price_month_cents = excluded.price_month_cents,
  price_year_cents  = excluded.price_year_cents,
  max_users         = excluded.max_users,
  max_folders       = excluded.max_folders,
  max_upload_bytes  = excluded.max_upload_bytes,
  env_lock_cents    = excluded.env_lock_cents,
  perm_lock_cents   = excluded.perm_lock_cents,
  sort_order        = excluded.sort_order,
  is_recommended    = excluded.is_recommended,
  is_active         = excluded.is_active;

insert into public.plan_features (feature_key, label, description, category, min_plan, sort_order)
values
  ('passwords',                'Password',               'Gestione credenziali cifrate',                          'password',  'free',       10),
  ('credential_categories',    'Categorie credenziali',  'Organizza le credenziali in categorie',                 'password',  'free',       20),
  ('password_shares',          'Condivisione password',  'Condividi credenziali cifrate tra utenti',              'password',  'free',       30),
  ('localdrop_upload',         'Caricamento documenti',  'Upload file su LocalDrop',                              'localdrop', 'free',       40),
  ('localdrop_text',           'Testo rapido',           'Crea note di testo rapide',                             'localdrop', 'free',       50),
  ('localdrop_folders',        'Creazione cartelle',     'Organizza i file in cartelle',                          'localdrop', 'free',       60),
  ('localdrop_doc_categories', 'Categorie documenti',    'Categorie per i documenti su LocalDrop',                'localdrop', 'essential',  70),
  ('localdrop_archive_load',   'Load Zip / Rar',         'Caricamento di archivi .zip e .rar',                    'localdrop', 'essential',  80),
  ('file_shares',              'Condivisione file',      'Condividi file tra utenti',                             'localdrop', 'essential',  90),
  ('localdrop_folder_compress','Compressione cartelle',  'Archiviazione, compressione e decompressione cartelle', 'localdrop', 'pro',       100),
  ('api_access',               'Accesso API',            'Accesso alle API (contattare lo sviluppatore)',         'licensing', 'essential', 110),
  ('priority_support',         'Assistenza prioritaria', 'Supporto con priorita''',                               'general',   'pro',       120)
on conflict (feature_key) do update set
  label       = excluded.label,
  description = excluded.description,
  category    = excluded.category,
  min_plan    = excluded.min_plan,
  sort_order  = excluded.sort_order;

alter table public.plans         enable row level security;
alter table public.plan_features enable row level security;

-- Catalogo pubblico: alimenta /pricing anche da non loggati.
drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select to anon, authenticated using (true);

drop policy if exists plan_features_public_read on public.plan_features;
create policy plan_features_public_read on public.plan_features
  for select to anon, authenticated using (true);

-- Scrittura: nessuna policy -> solo service_role (che bypassa la RLS).

-- ============================================================================
-- 3. ANAGRAFICA, AUDIT, RELEASE
-- ============================================================================

-- Una riga per utente registrato. L'email collega ad auth.users.
-- Il NOME non e' qui per minimizzazione GDPR (Art. 5.1.c): vive solo in
-- auth.users.raw_user_meta_data.name, unica fonte di verita'.
create table if not exists public.registrations (
    id               uuid primary key default gen_random_uuid(),
    email            text not null unique,
    plan             text not null default 'free' references public.plans(code) on update cascade,
    registered_at    timestamptz not null default now(),
    last_download_at timestamptz,
    last_unlock_at   timestamptz
);

create index if not exists idx_registrations_plan on public.registrations(plan);

-- Audit dei download via signed URL. Nessun IP: non necessario all'audit
-- (gia' legato all'email) e soggetto a minimizzazione.
create table if not exists public.downloads (
    id            uuid primary key default gen_random_uuid(),
    email         text not null references public.registrations(email) on delete cascade,
    version       text not null,
    downloaded_at timestamptz not null default now()
);

create index if not exists idx_downloads_email on public.downloads(email);

-- Build pubblicate. sha256/signature/sign_key_id permettono alla DesktopApp di
-- verificare integrita' (SHA-256) e autenticita' (Ed25519 detached, firmata
-- offline dal Tool-CLI: la chiave privata non tocca mai il browser).
create table if not exists public.releases (
    id           uuid primary key default gen_random_uuid(),
    version      text not null unique,
    release_date timestamptz not null default now(),
    notes        text,
    download_url text not null,          -- object path dentro il bucket 'releases'
    is_active    boolean not null default true,
    min_version  text,
    sha256       text,                   -- hex lowercase, 64 char
    signature    text,                   -- Ed25519 detached, base64
    sign_key_id  text
);

create index if not exists idx_releases_active on public.releases(is_active);

alter table public.registrations enable row level security;
alter table public.downloads     enable row level security;
alter table public.releases      enable row level security;

-- --- registrations ----------------------------------------------------------
drop policy if exists registrations_select_owner on public.registrations;
create policy registrations_select_owner on public.registrations
    for select to authenticated
    using (email = public.current_email());

drop policy if exists registrations_insert_self on public.registrations;
create policy registrations_insert_self on public.registrations
    for insert to authenticated
    with check (email = public.current_email());

-- Nessuna policy di UPDATE per authenticated: le modifiche (piano, timestamp)
-- passano da service_role o dalle RPC SECURITY DEFINER.

-- --- downloads --------------------------------------------------------------
drop policy if exists downloads_select_owner on public.downloads;
create policy downloads_select_owner on public.downloads
    for select to authenticated
    using (email = public.current_email());

drop policy if exists downloads_insert_self on public.downloads;
create policy downloads_insert_self on public.downloads
    for insert to authenticated
    with check (email = public.current_email());

-- --- releases ---------------------------------------------------------------
-- Authenticated: legge tutto (dashboard). Anon: solo le release attive, per il
-- controllo aggiornamenti della DesktopApp senza login.
drop policy if exists releases_select_all on public.releases;
create policy releases_select_all on public.releases
    for select to authenticated using (true);

drop policy if exists releases_select_anon_active on public.releases;
create policy releases_select_anon_active on public.releases
    for select to anon using (is_active = true);

drop policy if exists releases_admin_write on public.releases;
create policy releases_admin_write on public.releases
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 4. GDPR — cancellazione self-service e retention dell'audit
-- ============================================================================

-- Diritto all'oblio (Art. 17). Le FK `on delete cascade` propagano su downloads,
-- activations, orders, subscriptions, unlock_files. La riga in auth.users va
-- rimossa a parte via Admin API: il DB non puo' cancellarsi lo schema auth.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.registrations where email = public.current_email();
end;
$fn$;

revoke all     on function public.delete_my_account() from public;
grant  execute on function public.delete_my_account() to authenticated;

-- Retention dell'audit download: 90 giorni (Art. 5.1.e).
create or replace function public.purge_old_downloads(p_days int default 90)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare v_deleted integer;
begin
  delete from public.downloads
   where downloaded_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

-- Non esposta ai client: la esegue solo il job pianificato / service_role.
revoke all on function public.purge_old_downloads(int) from public, anon, authenticated;

-- KPI download per la tab /admin/analytics. SECURITY DEFINER perche' aggrega
-- public.downloads, che gli utenti non-admin non possono leggere via RLS.
create or replace function public.downloads_per_month()
returns table (month text, total bigint, unique_users bigint)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select to_char(date_trunc('month', d.downloaded_at), 'YYYY-MM'),
           count(*)::bigint, count(distinct d.email)::bigint
      from public.downloads d group by 1 order by 1;
end;
$fn$;

grant execute on function public.downloads_per_month() to authenticated;

create or replace function public.release_download_counts()
returns table (version text, total bigint, unique_users bigint)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select d.version, count(*)::bigint, count(distinct d.email)::bigint
      from public.downloads d group by d.version;
end;
$fn$;

grant execute on function public.release_download_counts() to authenticated;

-- ----------------------------------------------------------------------------
-- Schedulazione del purge con pg_cron.
--
-- pg_cron e' disponibile su Supabase ma va abilitato una tantum e vive nel
-- database `postgres` del progetto. L'intero blocco e' racchiuso in un gestore
-- di eccezioni: se l'estensione non e' disponibile la migration NON fallisce,
-- emette solo un avviso. Era l'unico punto dell'intera catena che poteva
-- interrompere una rimigrazione per motivi d'ambiente.
-- ----------------------------------------------------------------------------
do $mig$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'pg_cron non disponibile (%): schedula il purge a mano dalla Dashboard.', sqlerrm;
    return;
  end;

  begin
    perform cron.unschedule('purge_old_downloads_daily')
     where exists (select 1 from cron.job where jobname = 'purge_old_downloads_daily');
    perform cron.schedule('purge_old_downloads_daily', '30 3 * * *',
                          'select public.purge_old_downloads(90);');
    raise notice 'Job purge_old_downloads_daily schedulato alle 03:30 UTC.';
  exception when others then
    raise notice 'pg_cron presente ma schedulazione fallita (%).', sqlerrm;
  end;
end
$mig$;

-- ============================================================================
-- Fine 0001_foundation.sql
-- ============================================================================
