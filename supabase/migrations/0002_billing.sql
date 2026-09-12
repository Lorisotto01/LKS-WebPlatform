-- ============================================================================
-- 0002_billing.sql — Sconti, ordini, abbonamenti, file di sblocco.
--
--   * discounts     — sconti a tempo (percentuale) su piani o LOCK
--   * orders        — un record per tentativo d'acquisto (abbonamento o LOCK)
--   * subscriptions — abbonamento corrente per utente (una riga per email)
--   * unlock_files  — unlock.lks caricati DALL'ADMIN per gli ordini LOCK
--
-- Il calcolo del prezzo e la finalizzazione dell'ordine avvengono nelle Edge
-- Functions (create-checkout, stripe-webhook, paypal-webhook, simulate-payment)
-- con la service_role: queste tabelle sono in sola LETTURA per l'utente.
--
-- Le Edge Functions NON generano mai il file di sblocco: lo produce l'autore
-- col Tool-CLI e lo carica; send-unlock-email lo recapita.
--
-- Precede 0003_licensing perche' effective_plan_info() legge subscriptions.
-- Idempotente.
-- ============================================================================

-- ============================================================================
-- 1. SCONTI A TEMPO
-- ============================================================================
create table if not exists public.discounts (
    id           uuid primary key default gen_random_uuid(),
    code         text unique,                        -- coupon; null = sconto automatico
    label        text not null,
    percent      integer not null check (percent between 1 and 90),
    applies_to   text not null default 'plan'
                   check (applies_to in ('plan', 'lock', 'all')),
    plan_code    text references public.plans(code), -- null = tutti i piani nell'ambito
    starts_at    timestamptz not null default now(),
    ends_at      timestamptz not null,
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    check (ends_at > starts_at)
);

create index if not exists idx_discounts_active on public.discounts(is_active, starts_at, ends_at);

comment on table public.discounts is
  'Sconti a tempo (percentuale) su piani/LOCK. Validi tra starts_at ed ends_at se is_active.';

-- ============================================================================
-- 2. ORDINI
-- ============================================================================
create table if not exists public.orders (
    id             uuid primary key default gen_random_uuid(),
    email          text not null references public.registrations(email) on delete cascade,
    kind           text not null check (kind in ('subscription', 'lock')),
    -- subscription:
    plan_code      text references public.plans(code),
    billing_cycle  text check (billing_cycle in ('month', 'year')),
    -- lock:
    lock_type      text check (lock_type in ('env', 'perm')),
    hwid           text,                              -- device per cui generare l'unlock
    -- importi (centesimi EUR), calcolati lato server:
    base_cents     integer not null check (base_cents >= 0),
    discount_id    uuid references public.discounts(id),
    amount_cents   integer not null check (amount_cents >= 0),
    currency       text not null default 'eur',
    -- pagamento:
    provider                 text not null check (provider in ('stripe', 'paypal', 'simulated')),
    provider_ref             text,                    -- id sessione/ordine del provider
    provider_subscription_id text,                    -- id subscription (ricorrente)
    is_recurring             boolean not null default false,
    status         text not null default 'pending'
                     check (status in ('pending', 'paid', 'failed', 'canceled')),
    created_at     timestamptz not null default now(),
    -- TTL del tentativo di pagamento: oltre questo istante un ordine ancora
    -- 'pending' e' abbandonato e va marcato 'failed' (vedi sezione 7).
    expires_at     timestamptz not null default now() + interval '30 minutes',
    paid_at        timestamptz,
    check (
      (kind = 'subscription' and plan_code is not null and billing_cycle is not null)
      or (kind = 'lock' and lock_type is not null)
    )
);

-- Database creati prima dell'introduzione del TTL: aggiunge la colonna e da' una
-- scadenza retroattiva ai pending storici (30 minuti dalla loro creazione).
alter table public.orders add column if not exists expires_at timestamptz;
update public.orders set expires_at = created_at + interval '30 minutes' where expires_at is null;
alter table public.orders alter column expires_at set default now() + interval '30 minutes';
alter table public.orders alter column expires_at set not null;

create index if not exists idx_orders_email        on public.orders(email);
create index if not exists idx_orders_status       on public.orders(status);
create index if not exists idx_orders_provider_ref on public.orders(provider_ref);
-- Serve al job di scadenza: scansiona solo i pending gia' oltre il TTL.
create index if not exists idx_orders_pending_ttl  on public.orders(expires_at) where status = 'pending';

comment on table public.orders is
  'Ordini (abbonamento o LOCK). Importi calcolati server-side; status guidato dai webhook.';
comment on column public.orders.expires_at is
  'Scadenza del tentativo di pagamento. Allineata a expires_at della sessione Stripe.';

-- ============================================================================
-- 3. ABBONAMENTI
-- ============================================================================
create table if not exists public.subscriptions (
    email                    text primary key references public.registrations(email) on delete cascade,
    plan_code                text not null references public.plans(code),
    billing_cycle            text not null check (billing_cycle in ('month', 'year')),
    status                   text not null default 'active'
                               check (status in ('active', 'canceled', 'expired')),
    provider                 text,
    provider_subscription_id text,
    auto_renew               boolean not null default false,
    cancel_at_period_end     boolean not null default false,
    current_period_end       timestamptz,
    updated_at               timestamptz not null default now()
);

create index if not exists idx_subscriptions_provider_sub
  on public.subscriptions(provider_subscription_id);

comment on table public.subscriptions is
  'Abbonamento corrente per utente. La fonte di verita'' del piano resta registrations.plan.';

-- ============================================================================
-- 4. FILE DI SBLOCCO
-- ============================================================================
-- storage_path = percorso nel bucket 'unlocks', formato <email>/<file>.lks:
-- la policy di lettura sul bucket (0006) usa proprio la prima cartella.
create table if not exists public.unlock_files (
    id            uuid primary key default gen_random_uuid(),
    order_id      uuid not null references public.orders(id) on delete cascade,
    email         text not null references public.registrations(email) on delete cascade,
    hwid          text,
    lock_type     text check (lock_type in ('env', 'perm')),
    storage_path  text not null,
    status        text not null default 'ready'
                    check (status in ('ready', 'emailed', 'downloaded')),
    note          text,
    created_at    timestamptz not null default now(),
    emailed_at    timestamptz,
    downloaded_at timestamptz
);

create index if not exists idx_unlock_files_order on public.unlock_files(order_id);
create index if not exists idx_unlock_files_email on public.unlock_files(email);

comment on table public.unlock_files is
  'File di sblocco (unlock.lks) caricati dall''admin per gli ordini LOCK.';

-- ============================================================================
-- 5. RLS
-- ============================================================================
alter table public.discounts     enable row level security;
alter table public.orders        enable row level security;
alter table public.subscriptions enable row level security;
alter table public.unlock_files  enable row level security;

-- discounts: chiunque vede quelli attivi e in corso; l'admin vede e scrive tutto.
drop policy if exists discounts_public_read on public.discounts;
create policy discounts_public_read on public.discounts
  for select to anon, authenticated
  using (is_active and now() between starts_at and ends_at);

drop policy if exists discounts_admin_read on public.discounts;
create policy discounts_admin_read on public.discounts
  for select to authenticated using (public.is_admin());

drop policy if exists discounts_admin_write on public.discounts;
create policy discounts_admin_write on public.discounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders: l'utente vede i propri, l'admin tutti. Scrittura solo service_role.
drop policy if exists orders_select_owner on public.orders;
create policy orders_select_owner on public.orders
  for select to authenticated
  using (email = public.current_email() or public.is_admin());

-- subscriptions: idem.
drop policy if exists subscriptions_select_owner on public.subscriptions;
create policy subscriptions_select_owner on public.subscriptions
  for select to authenticated
  using (email = public.current_email() or public.is_admin());

-- unlock_files: l'utente vede i propri; scrittura solo admin (upload/gestione).
drop policy if exists unlock_files_select on public.unlock_files;
create policy unlock_files_select on public.unlock_files
  for select to authenticated
  using (email = public.current_email() or public.is_admin());

drop policy if exists unlock_files_admin_write on public.unlock_files;
create policy unlock_files_admin_write on public.unlock_files
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 6. RPC
-- ============================================================================

-- Catalogo completo (piani + features) in una chiamata. Pubblica: alimenta
-- /pricing e il gating di WebApp/DesktopApp.
create or replace function public.get_plans_catalog()
returns jsonb
language sql stable security definer set search_path = public as $fn$
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
$fn$;

grant execute on function public.get_plans_catalog() to anon, authenticated;

-- Sconti attivi (pricing/checkout).
create or replace function public.get_active_discounts()
returns setof public.discounts
language sql stable security definer set search_path = public as $fn$
  select * from public.discounts
   where is_active and now() between starts_at and ends_at
   order by percent desc;
$fn$;

grant execute on function public.get_active_discounts() to anon, authenticated;

-- Conteggi utenti per piano — card Contabilita' in /admin.
create or replace function public.admin_plan_accounting()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v_total integer; v_free integer; v_ess integer; v_pro integer;
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

  return jsonb_build_object('total', v_total, 'free', v_free,
                            'essential', v_ess, 'pro', v_pro);
end;
$fn$;

grant execute on function public.admin_plan_accounting() to authenticated;

-- Totali ordini pagati — card Contabilita'.
create or replace function public.admin_orders_summary()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v_paid integer; v_revenue bigint;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select count(*), coalesce(sum(amount_cents), 0)
    into v_paid, v_revenue
    from public.orders where status = 'paid';
  return jsonb_build_object('paid_orders', v_paid, 'revenue_cents', v_revenue);
end;
$fn$;

grant execute on function public.admin_orders_summary() to authenticated;

-- L'utente segna come scaricato il proprio file di sblocco.
create or replace function public.mark_unlock_downloaded(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  update public.unlock_files
     set status = 'downloaded', downloaded_at = now()
   where id = p_id
     and email = public.current_email()
     and status <> 'downloaded';
end;
$fn$;

grant execute on function public.mark_unlock_downloaded(uuid) to authenticated;

-- ============================================================================
-- 7. TTL DEGLI ORDINI ABBANDONATI
--
-- Un ordine nasce 'pending' e diventa 'paid' solo quando arriva il webhook del
-- provider. Se l'utente chiude la pagina di Stripe/PayPal senza pagare, quel
-- webhook non arriva mai e l'ordine resterebbe 'pending' per sempre, sporcando
-- la dashboard dell'utente e la contabilita' dell'admin.
--
-- Difesa a due livelli, entrambi necessari:
--   * questo job (autorevole: cambia davvero il dato, quindi vale anche per le
--     RPC di contabilita' e per il pannello admin);
--   * il calcolo derivato lato UI, che mostra subito lo stato reale senza
--     aspettare il passaggio del cron.
-- ============================================================================

-- Marca 'failed' i pending oltre il TTL. Ritorna quanti ne ha chiusi.
-- Non tocca mai gli ordini gia' paid/failed/canceled: e' idempotente per natura.
create or replace function public.expire_stale_orders()
returns integer
language plpgsql security definer set search_path = public as $fn$
declare v_count integer;
begin
  update public.orders
     set status = 'failed'
   where status = 'pending'
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- Non e' una RPC: la chiama solo pg_cron. Il grant implicito a PUBLIC va tolto,
-- altrimenti qualsiasi utente autenticato potrebbe invocarla via PostgREST.
revoke execute on function public.expire_stale_orders() from public;

comment on function public.expire_stale_orders() is
  'Marca failed gli ordini pending oltre expires_at. Eseguita da pg_cron ogni 5 minuti.';

-- L'utente chiude la pagina del provider e torna sul cancel_url: l'ordine viene
-- annullato subito, senza attendere il TTL. Distinto da 'failed' (TTL scaduto)
-- perche' e' una rinuncia esplicita, non un tentativo andato a vuoto.
create or replace function public.cancel_my_order(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $fn$
declare v_status text;
begin
  update public.orders
     set status = 'canceled'
   where id = p_id
     and email = public.current_email()
     and status = 'pending'
  returning status into v_status;

  if v_status is null then
    -- Gia' pagato, gia' chiuso, o non e' suo: restituisce lo stato corrente
    -- (null se l'ordine non e' visibile all'utente) senza sollevare eccezioni.
    select o.status into v_status
      from public.orders o
     where o.id = p_id and o.email = public.current_email();
  end if;
  return v_status;
end;
$fn$;

grant execute on function public.cancel_my_order(uuid) to authenticated;

-- Backfill: i pending gia' scaduti al momento della migration vengono chiusi
-- subito, altrimenti resterebbero gialli fino al primo giro di cron.
select public.expire_stale_orders();

-- ----------------------------------------------------------------------------
-- Schedulazione con pg_cron (stesso pattern difensivo di 0001_foundation):
-- se l'estensione non c'e', la migration avvisa e prosegue.
-- ----------------------------------------------------------------------------
do $mig$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'pg_cron non disponibile (%): gli ordini scadono solo lato UI.', sqlerrm;
    return;
  end;

  begin
    perform cron.unschedule('expire_stale_orders_5min')
     where exists (select 1 from cron.job where jobname = 'expire_stale_orders_5min');
    perform cron.schedule('expire_stale_orders_5min', '*/5 * * * *',
                          'select public.expire_stale_orders();');
    raise notice 'Job expire_stale_orders_5min schedulato ogni 5 minuti.';
  exception when others then
    raise notice 'pg_cron presente ma schedulazione fallita (%).', sqlerrm;
  end;
end
$mig$;

-- ============================================================================
-- Fine 0002_billing.sql
-- ============================================================================
