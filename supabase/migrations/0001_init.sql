-- ============================================================================
-- SecureLocalShare — Platform Web schema (Fase 5)
-- Source of truth for users (registrations), download audit and releases.
-- Auth is handled by Supabase Auth (auth.users); linked to public tables by email.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- registrations: one row per registered user (email = link to auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.registrations (
    id               uuid primary key default gen_random_uuid(),
    email            text not null unique,
    name             text not null,
    plan             text not null default 'free',
    registered_at    timestamptz not null default now(),
    last_download_at timestamptz,
    last_unlock_at   timestamptz
);

-- ----------------------------------------------------------------------------
-- downloads: audit trail of every signed-URL download
-- ----------------------------------------------------------------------------
create table if not exists public.downloads (
    id            uuid primary key default gen_random_uuid(),
    email         text not null references public.registrations(email) on delete cascade,
    version       text not null,
    downloaded_at timestamptz not null default now(),
    ip_address    text
);

-- ----------------------------------------------------------------------------
-- releases: published builds (managed only by the CLI author / service_role)
-- ----------------------------------------------------------------------------
create table if not exists public.releases (
    id           uuid primary key default gen_random_uuid(),
    version      text not null unique,
    release_date timestamptz not null default now(),
    notes        text,
    download_url text not null,          -- storage object path inside the 'releases' bucket
    is_active    boolean not null default true,
    min_version  text
);

create index if not exists idx_downloads_email on public.downloads(email);
create index if not exists idx_releases_active on public.releases(is_active);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.registrations enable row level security;
alter table public.downloads     enable row level security;
alter table public.releases      enable row level security;

-- Helper: the email of the currently authenticated user.
create or replace function public.current_email() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')
$$;

-- --- registrations -----------------------------------------------------------
-- Read: only the owner (logged-in email).
drop policy if exists registrations_select_owner on public.registrations;
create policy registrations_select_owner on public.registrations
    for select to authenticated
    using (email = public.current_email());

-- Insert: the web app creates a registration for the logged-in email only.
drop policy if exists registrations_insert_self on public.registrations;
create policy registrations_insert_self on public.registrations
    for insert to authenticated
    with check (email = public.current_email());

-- Update (hardware_id / timestamps): reserved to the CLI author via service_role,
-- which bypasses RLS. No policy for authenticated users → updates are denied for them.

-- --- downloads ---------------------------------------------------------------
-- Read: only the owner.
drop policy if exists downloads_select_owner on public.downloads;
create policy downloads_select_owner on public.downloads
    for select to authenticated
    using (email = public.current_email());

-- Insert: web app inserts a download record for the logged-in email.
drop policy if exists downloads_insert_self on public.downloads;
create policy downloads_insert_self on public.downloads
    for insert to authenticated
    with check (email = public.current_email());

-- --- releases ----------------------------------------------------------------
-- Read: every authenticated user can list releases.
drop policy if exists releases_select_all on public.releases;
create policy releases_select_all on public.releases
    for select to authenticated
    using (true);

-- Write: only service_role (CLI author). service_role bypasses RLS, so we add
-- no insert/update/delete policy for authenticated users → denied.

-- ============================================================================
-- Storage: private bucket 'releases' for the .exe artifacts.
-- Downloads must go through a signed URL (10 min) — never a public URL.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('releases', 'releases', false)
on conflict (id) do update set public = false;

-- Authenticated users may create a signed URL for objects in the bucket
-- (createSignedUrl requires a SELECT grant on the object).
drop policy if exists releases_objects_read on storage.objects;
create policy releases_objects_read on storage.objects
    for select to authenticated
    using (bucket_id = 'releases');

-- Uploads to the bucket are performed by the CLI author via service_role only.
