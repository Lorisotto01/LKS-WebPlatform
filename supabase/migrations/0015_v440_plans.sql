-- ============================================================================
-- 0015_v440_plans.sql
--
-- v4.4.0 — Piani & Abbonamenti (Fase 1: modello dati + gating).
--
-- Introduce la "single source of truth" dei piani sul DB. Fino ad oggi il piano
-- viveva come semplice testo in `registrations.plan` (scaffolding v4.3.6) e le RPC
-- bind_activation/validate_license lo restituivano alla DesktopApp per il mirror
-- in environment.lks. Qui formalizziamo:
--
--   * public.plans          — definizione dei 3 piani (Free/Essential/Pro): prezzi,
--                             limiti (utenti, cartelle, upload) e sconti sui LOCK.
--   * public.plan_features  — matrice funzionalità -> piano minimo che le sblocca.
--                             È la base del gating su WebApp/DesktopApp e delle
--                             targhette "ESSENTIAL"/"PRO".
--   * registrations.plan    — vincolato via FK a plans(code).
--   * RPC get_plans_catalog()    — catalogo pubblico (pricing + apps).
--   * RPC admin_plan_accounting()— conteggi per piano per la card Contabilità /admin.
--
-- I PAGAMENTI (Stripe/PayPal, ordini, checkout) NON sono in questa migration:
-- appartengono alla Fase 2 dello stesso task.
--
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT, rieseguibile senza effetti.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabella plans — un record per piano commerciale.
-- Prezzi in centesimi di euro (interi, no float). max_* NULL = illimitato.
-- ----------------------------------------------------------------------------
create table if not exists public.plans (
    code                text primary key
                          check (code in ('free', 'essential', 'pro')),
    name                text    not null,
    tagline             text,
    -- Prezzi abbonamento (centesimi €). Free = 0.
    price_month_cents   integer not null default 0 check (price_month_cents >= 0),
    price_year_cents    integer not null default 0 check (price_year_cents  >= 0),
    -- Limiti quantitativi (NULL = illimitato).
    max_users           integer check (max_users   is null or max_users   > 0),
    max_folders         integer check (max_folders is null or max_folders > 0),
    max_upload_bytes    bigint  not null,
    -- Prezzi dei LOCK già scontati per piano (centesimi €).
    env_lock_cents      integer not null,
    perm_lock_cents     integer not null,
    -- Presentazione.
    sort_order          integer not null default 0,
    is_recommended      boolean not null default false,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now()
);

comment on table public.plans is
  'Definizione piani (single source of truth). Prezzi in centesimi €; max_* NULL = illimitato.';

-- ----------------------------------------------------------------------------
-- Tabella plan_features — catalogo funzionalità con il piano minimo richiesto.
-- min_plan indica da quale piano la feature è sbloccata; la UI mostra la
-- targhetta corrispondente (ESSENTIAL/PRO) quando l'utente non ce l'ha.
-- `limit_value` opzionale per feature con soglia (es. cartelle, upload).
-- ----------------------------------------------------------------------------
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
  'Matrice feature -> piano minimo che la sblocca. Base del gating e delle targhette.';

-- ----------------------------------------------------------------------------
-- Seed piani. ON CONFLICT DO UPDATE così un riavvio della migration allinea i
-- valori commerciali senza duplicare.
-- ----------------------------------------------------------------------------
insert into public.plans
  (code, name, tagline, price_month_cents, price_year_cents,
   max_users, max_folders, max_upload_bytes,
   env_lock_cents, perm_lock_cents, sort_order, is_recommended, is_active)
values
  ('free', 'Free', 'Per iniziare, sempre gratis',
      0, 0,
      3, 3, 5368709120,           -- 5 GB
      12000, 10000, 1, false, true),
  ('essential', 'Essential', 'Più spazio e collaborazione',
      499, 5000,
      8, null, 10737418240,       -- 10 GB, cartelle illimitate
      10200, 6500, 2, true, true),
  ('pro', 'Pro', 'Nessun limite, massima potenza',
      999, 10000,
      null, null, 21474836480,    -- 20 GB, utenti/cartelle illimitati
      6000, 1000, 3, false, true)
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

-- ----------------------------------------------------------------------------
-- Seed feature matrix. min_plan = livello che sblocca la funzionalità.
-- I feature_key sono stabili: vengono referenziati anche dal gating client.
-- ----------------------------------------------------------------------------
insert into public.plan_features (feature_key, label, description, category, min_plan, sort_order)
values
  -- Password manager (tutto Free)
  ('passwords',            'Password',                 'Gestione credenziali cifrate',                      'password',  'free',      10),
  ('credential_categories','Categorie credenziali',    'Organizza le credenziali in categorie',             'password',  'free',      20),
  ('password_shares',      'Condivisione password',    'Condividi credenziali cifrate tra utenti',          'password',  'free',      30),
  -- LocalDrop
  ('localdrop_upload',     'Caricamento documenti',    'Upload file su LocalDrop',                          'localdrop', 'free',      40),
  ('localdrop_text',       'Testo rapido',             'Crea note di testo rapide',                         'localdrop', 'free',      50),
  ('localdrop_folders',    'Creazione cartelle',       'Organizza i file in cartelle',                      'localdrop', 'free',      60),
  ('localdrop_doc_categories','Categorie documenti',   'Categorie per i documenti su LocalDrop',            'localdrop', 'essential', 70),
  ('localdrop_archive_load','Load Zip / Rar',          'Caricamento di archivi .zip e .rar',                'localdrop', 'essential', 80),
  ('file_shares',          'Condivisione file',        'Condividi file tra utenti',                         'localdrop', 'essential', 90),
  ('localdrop_folder_compress','Compressione cartelle','Archiviazione, compressione e decompressione cartelle','localdrop','pro',    100),
  -- Licensing / servizi
  ('api_access',           'Accesso API',              'Accesso alle API (contattare lo sviluppatore)',     'licensing', 'essential', 110),
  ('priority_support',     'Assistenza prioritaria',   'Supporto con priorità',                             'general',   'pro',       120)
on conflict (feature_key) do update set
  label       = excluded.label,
  description = excluded.description,
  category    = excluded.category,
  min_plan    = excluded.min_plan,
  sort_order  = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- registrations.plan -> plans(code): normalizza valori sconosciuti e aggiunge FK.
-- ----------------------------------------------------------------------------
update public.registrations
   set plan = 'free'
 where plan is null or plan not in ('free', 'essential', 'pro');

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'registrations_plan_fkey'
      and table_name = 'registrations'
  ) then
    alter table public.registrations
      add constraint registrations_plan_fkey
      foreign key (plan) references public.plans(code) on update cascade;
  end if;
end $$;

create index if not exists idx_registrations_plan on public.registrations(plan);

-- ----------------------------------------------------------------------------
-- RLS: catalogo leggibile da tutti (pricing pubblico); scrittura solo service_role.
-- ----------------------------------------------------------------------------
alter table public.plans         enable row level security;
alter table public.plan_features enable row level security;

drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select to anon, authenticated using (true);

drop policy if exists plan_features_public_read on public.plan_features;
create policy plan_features_public_read on public.plan_features
  for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
-- RPC get_plans_catalog() — catalogo completo (piani + features) in un colpo solo.
-- Pubblica: alimenta pricing WebPlatform e il gating di WebApp/DesktopApp.
-- ----------------------------------------------------------------------------
create or replace function public.get_plans_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort_order)
      from public.plans p where p.is_active
    ), '[]'::jsonb),
    'features', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.sort_order)
      from public.plan_features f
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_plans_catalog() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC admin_plan_accounting() — conteggi utenti per piano (card Contabilità /admin).
-- Solo admin (is_admin, def. in 0004). SECURITY DEFINER per leggere registrations.
-- ----------------------------------------------------------------------------
create or replace function public.admin_plan_accounting()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_free  integer;
  v_ess   integer;
  v_pro   integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*),
         count(*) filter (where plan = 'free'),
         count(*) filter (where plan = 'essential'),
         count(*) filter (where plan = 'pro')
    into v_total, v_free, v_ess, v_pro
    from public.registrations;

  return jsonb_build_object(
    'total',     v_total,
    'free',      v_free,
    'essential', v_ess,
    'pro',       v_pro
  );
end;
$$;

grant execute on function public.admin_plan_accounting() to authenticated;

-- ============================================================================
-- Fine 0015_v440_plans.sql
-- ============================================================================
