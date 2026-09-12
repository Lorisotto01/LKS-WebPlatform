-- ============================================================================
-- 0005_content.sql — Contenuti editoriali gestiti dall'admin.
--
--   * author_profile — pagina /chi-sono (singleton, id = 1)
--   * doc_settings   — impostazioni della pagina /docs (singleton, id = 1)
--   * doc_blocks     — contenuto di /docs come blocchi ordinati e riordinabili
--   * reviews        — recensioni per versione (/recensioni, card in /dashboard)
--
-- QUESTA MIGRATION CREA SOLO LE TABELLE, VUOTE.
-- I contenuti (testi della guida, biografia, impostazioni pagina) stanno in
-- scripts/03_seed_content.sql, da eseguire dopo le migration. La separazione e'
-- voluta: lo schema e' codice e si rigioca sempre uguale, i contenuti sono dati
-- editabili dal pannello admin e non devono essere sovrascritti da una migration.
--
-- Idempotente.
-- ============================================================================

-- ============================================================================
-- 1. PROFILO AUTORE — pagina /chi-sono
-- ============================================================================
create table if not exists public.author_profile (
    id           smallint primary key default 1,
    display_name text        not null default 'Lorenzo Sottocorno',
    headline     text,                       -- sottotitolo, "cosa faccio online"
    bio          text,                       -- testo libero, a capo = paragrafo
    photo_url    text,                       -- URL pubblico (bucket assets)
    email        text,
    location     text,
    contacts     jsonb       not null default '[]'::jsonb,   -- [{label, value, href}]
    updated_at   timestamptz not null default now(),
    constraint author_profile_singleton check (id = 1)
);

alter table public.author_profile enable row level security;

-- Lettura pubblica: /chi-sono fa parte della landing, visibile anche da anon.
drop policy if exists author_profile_read on public.author_profile;
create policy author_profile_read on public.author_profile
    for select to anon, authenticated using (true);

drop policy if exists author_profile_admin_write on public.author_profile;
create policy author_profile_admin_write on public.author_profile
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

create or replace function public.author_profile_touch()
returns trigger language plpgsql as $fn$
begin new.updated_at := now(); return new; end;
$fn$;

drop trigger if exists trg_author_profile_touch on public.author_profile;
create trigger trg_author_profile_touch before update on public.author_profile
    for each row execute function public.author_profile_touch();

-- ============================================================================
-- 2. IMPOSTAZIONI /docs
-- ============================================================================
create table if not exists public.doc_settings (
    id             smallint primary key default 1,
    page_title     text not null default 'Guida a SecureLocalShare',
    page_subtitle  text,
    show_index     boolean not null default true,
    show_numbering boolean not null default true,
    updated_at     timestamptz not null default now(),
    constraint doc_settings_singleton check (id = 1)
);

alter table public.doc_settings enable row level security;

drop policy if exists doc_settings_read on public.doc_settings;
create policy doc_settings_read on public.doc_settings
    for select to anon, authenticated using (true);

drop policy if exists doc_settings_admin_write on public.doc_settings;
create policy doc_settings_admin_write on public.doc_settings
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 3. BLOCCHI /docs
-- ============================================================================
-- `position` e' double precision per permettere l'inserimento fra due blocchi
-- senza rinumerare tutto (drag & drop nell'editor).
--
-- La forma di `content` dipende da `type`:
--   title     { "text": "...", "icon": "ShieldCheck" }
--   paragraph { "text": "... markdown inline ..." }
--   image     { "url": "...", "alt": "...", "caption": "..." }
--   note      { "text": "..." }
--   warning   { "text": "..." }
--   list      { "ordered": false, "items": ["...", "..."] }
--   table     { "header": true, "rows": [["a","b"],["c","d"]] }
--   code      { "lang": "bash", "code": "..." }
--   divider   {}
create table if not exists public.doc_blocks (
    id         uuid primary key default gen_random_uuid(),
    position   double precision not null default 0,
    type       text not null default 'paragraph'
                 check (type in ('title','paragraph','image','note','warning',
                                 'list','table','code','divider')),
    content    jsonb not null default '{}'::jsonb,
    visible    boolean not null default true,
    updated_at timestamptz not null default now()
);

create index if not exists idx_doc_blocks_position on public.doc_blocks(position);

alter table public.doc_blocks enable row level security;

-- Il pubblico vede solo i blocchi visibili; l'admin vede e gestisce tutto.
drop policy if exists doc_blocks_read on public.doc_blocks;
create policy doc_blocks_read on public.doc_blocks
    for select to anon, authenticated
    using (visible or public.is_admin());

drop policy if exists doc_blocks_admin_write on public.doc_blocks;
create policy doc_blocks_admin_write on public.doc_blocks
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

create or replace function public.doc_blocks_touch()
returns trigger language plpgsql as $fn$
begin new.updated_at := now(); return new; end;
$fn$;

drop trigger if exists trg_doc_blocks_touch on public.doc_blocks;
create trigger trg_doc_blocks_touch before update on public.doc_blocks
    for each row execute function public.doc_blocks_touch();

-- ============================================================================
-- 4. RECENSIONI
-- ============================================================================
create table if not exists public.reviews (
    id          uuid primary key default gen_random_uuid(),
    email       text,                         -- vincolata all'utente loggato in insert
    author_name text,                         -- snapshot del nome, niente join
    version     text not null,
    titolo      text not null,
    rating      smallint not null check (rating between 1 and 5),
    descrizione text,
    created_at  timestamptz not null default now()
);

create index if not exists idx_reviews_version on public.reviews(version);
create index if not exists idx_reviews_created on public.reviews(created_at desc);

alter table public.reviews enable row level security;

-- Vetrina pubblica.
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews
    for select to anon, authenticated using (true);

-- Si scrive solo a proprio nome.
drop policy if exists reviews_insert_self on public.reviews;
create policy reviews_insert_self on public.reviews
    for insert to authenticated
    with check (email = public.current_email());

-- L'autore cancella le proprie, l'admin tutte.
drop policy if exists reviews_delete_owner on public.reviews;
create policy reviews_delete_owner on public.reviews
    for delete to authenticated
    using (email = public.current_email() or public.is_admin());

-- ============================================================================
-- Fine 0005_content.sql
-- ============================================================================
