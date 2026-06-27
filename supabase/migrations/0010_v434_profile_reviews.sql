-- ============================================================================
-- v4.3.4 — WebPlatform: profilo autore (Chi sono), recensioni, analytics.
--
-- Contesto (task ClickUp 869dve2e4 "Migliorie Routing WP e WebPlatform v4.3.4"):
--   * author_profile  -> contenuti della pagina /chi-sono, editabili dall'admin
--   * reviews         -> recensioni per versione (card in /dashboard, vetrina /recensioni)
--   * downloads_per_month() -> KPI download mensili per la tab /admin/analytics
--   * bucket 'assets' -> foto profilo (lettura pubblica, scrittura solo admin)
--
-- Helper riusati: public.is_admin() (0004) e public.current_email() (0001).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) author_profile — singleton (una sola riga, id = 1) per la pagina /chi-sono
-- ----------------------------------------------------------------------------
create table if not exists public.author_profile (
    id           smallint primary key default 1,
    display_name text        not null default 'Lorenzo Sottocorno',
    headline     text,                       -- "cosa faccio online" (sottotitolo)
    bio          text,                       -- biografia (testo libero, a capo = paragrafo)
    photo_url    text,                       -- URL pubblico della foto (bucket assets)
    email        text,
    location     text,
    -- contatti come array di oggetti {label, value, href}
    contacts     jsonb       not null default '[]'::jsonb,
    updated_at   timestamptz not null default now(),
    constraint author_profile_singleton check (id = 1)
);

alter table public.author_profile enable row level security;

-- Lettura pubblica (la pagina /chi-sono è parte della landing, anche da anon).
drop policy if exists author_profile_read on public.author_profile;
create policy author_profile_read on public.author_profile
    for select to anon, authenticated
    using (true);

-- Scrittura riservata all'admin.
drop policy if exists author_profile_admin_write on public.author_profile;
create policy author_profile_admin_write on public.author_profile
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create or replace function public.author_profile_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_author_profile_touch on public.author_profile;
create trigger trg_author_profile_touch before update on public.author_profile
    for each row execute function public.author_profile_touch();

-- Riga iniziale (idempotente).
insert into public.author_profile (id, display_name, headline, bio, email, contacts)
values (
    1,
    'Lorenzo Sottocorno',
    'Sviluppatore e autore di SecureLocalShare',
    'Inserisci qui la tua biografia dal pannello admin (/admin/docs-manager).',
    'lorisotto2001@gmail.com',
    '[]'::jsonb
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2) reviews — recensioni per versione (rating 1..5)
-- ----------------------------------------------------------------------------
create table if not exists public.reviews (
    id          uuid primary key default gen_random_uuid(),
    email       text,                         -- autore (vincolato all'utente loggato in insert)
    author_name text,                         -- nome mostrato (snapshot, niente join)
    version     text not null,
    titolo      text not null,
    rating      smallint not null check (rating between 1 and 5),
    descrizione text,
    created_at  timestamptz not null default now()
);

create index if not exists idx_reviews_version on public.reviews(version);
create index if not exists idx_reviews_created on public.reviews(created_at desc);

alter table public.reviews enable row level security;

-- Lettura pubblica: la vetrina /recensioni è accessibile a tutti.
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews
    for select to anon, authenticated
    using (true);

-- L'utente loggato può inserire SOLO recensioni a proprio nome (email = la sua).
drop policy if exists reviews_insert_self on public.reviews;
create policy reviews_insert_self on public.reviews
    for insert to authenticated
    with check (email = public.current_email());

-- L'autore può cancellare le proprie recensioni; l'admin tutte.
drop policy if exists reviews_delete_owner on public.reviews;
create policy reviews_delete_owner on public.reviews
    for delete to authenticated
    using (email = public.current_email() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 3) downloads_per_month() — KPI download mensili (solo admin)
--    Aggrega public.downloads, non leggibile dagli utenti non-admin via RLS.
-- ----------------------------------------------------------------------------
create or replace function public.downloads_per_month()
returns table (month text, total bigint, unique_users bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select to_char(date_trunc('month', d.downloaded_at), 'YYYY-MM') as month,
           count(*)::bigint,
           count(distinct d.email)::bigint
      from public.downloads d
     group by 1
     order by 1;
end;
$$;

grant execute on function public.downloads_per_month() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Bucket pubblico 'assets' per la foto profilo (lettura pubblica, write admin)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

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
