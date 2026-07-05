-- ============================================================================
-- 0016_v440_checkout.sql
--
-- v4.4.0 — Fase 2: Ordini, Abbonamenti e Sconti a tempo.
--
-- Completa il task "Implementazione Pagamento" con il modello dati del checkout:
--
--   * public.discounts     — sconti a tempo (percentuale) per invogliare l'upgrade.
--   * public.orders        — ordini di acquisto (abbonamento piano o LOCK), con
--                            stato del pagamento e riferimento al provider.
--   * public.subscriptions — abbonamento attivo per utente (piano + ciclo + scadenza).
--
-- Il calcolo del prezzo e la finalizzazione dell'ordine avvengono lato server
-- nelle Supabase Edge Functions (create-checkout, stripe-webhook, paypal-webhook,
-- simulate-payment) usando la service_role: le tabelle qui sono in sola lettura
-- per l'utente (le proprie righe) e in scrittura per admin/service_role.
--
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- discounts — sconti a tempo. `percent` 1..90. `applies_to` limita l'ambito.
-- ----------------------------------------------------------------------------
create table if not exists public.discounts (
    id           uuid primary key default gen_random_uuid(),
    code         text unique,                       -- opzionale (coupon); null = sconto automatico
    label        text not null,
    percent      integer not null check (percent between 1 and 90),
    applies_to   text not null default 'plan'
                   check (applies_to in ('plan', 'lock', 'all')),
    plan_code    text references public.plans(code),-- null = tutti i piani nell'ambito
    starts_at    timestamptz not null default now(),
    ends_at      timestamptz not null,
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    check (ends_at > starts_at)
);

create index if not exists idx_discounts_active on public.discounts(is_active, starts_at, ends_at);

comment on table public.discounts is
  'Sconti a tempo (percentuale) su piani/LOCK. Validi tra starts_at ed ends_at se is_active.';

-- ----------------------------------------------------------------------------
-- orders — un record per tentativo d'acquisto (piano o LOCK).
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
    id             uuid primary key default gen_random_uuid(),
    email          text not null references public.registrations(email) on delete cascade,
    kind           text not null check (kind in ('subscription', 'lock')),
    -- subscription:
    plan_code      text references public.plans(code),
    billing_cycle  text check (billing_cycle in ('month', 'year')),
    -- lock:
    lock_type      text check (lock_type in ('env', 'perm')),
    -- importi (centesimi €), calcolati lato server:
    base_cents     integer not null check (base_cents >= 0),
    discount_id    uuid references public.discounts(id),
    amount_cents   integer not null check (amount_cents >= 0),
    currency       text not null default 'eur',
    -- pagamento:
    provider       text not null check (provider in ('stripe', 'paypal', 'simulated')),
    provider_ref   text,                              -- id sessione/ordine del provider
    status         text not null default 'pending'
                     check (status in ('pending', 'paid', 'failed', 'canceled')),
    created_at     timestamptz not null default now(),
    paid_at        timestamptz,
    check (
      (kind = 'subscription' and plan_code is not null and billing_cycle is not null)
      or (kind = 'lock' and lock_type is not null)
    )
);

create index if not exists idx_orders_email on public.orders(email);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_provider_ref on public.orders(provider_ref);

comment on table public.orders is
  'Ordini di acquisto (abbonamento o LOCK). Importi calcolati server-side; status guidato dai webhook.';

-- ----------------------------------------------------------------------------
-- subscriptions — abbonamento corrente per utente (una riga per email).
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
    email               text primary key references public.registrations(email) on delete cascade,
    plan_code           text not null references public.plans(code),
    billing_cycle       text not null check (billing_cycle in ('month', 'year')),
    status              text not null default 'active'
                          check (status in ('active', 'canceled', 'expired')),
    provider            text,
    current_period_end  timestamptz,
    updated_at          timestamptz not null default now()
);

comment on table public.subscriptions is
  'Abbonamento corrente per utente. La fonte di verità del piano resta registrations.plan (mirrorata alle app).';

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.discounts     enable row level security;
alter table public.orders        enable row level security;
alter table public.subscriptions enable row level security;

-- discounts: lettura pubblica dei soli sconti attivi e in corso; scrittura solo admin.
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

-- orders: l'utente vede i propri ordini; scrittura riservata a service_role/webhook.
drop policy if exists orders_select_owner on public.orders;
create policy orders_select_owner on public.orders
  for select to authenticated
  using (email = public.current_email() or public.is_admin());

-- subscriptions: l'utente vede la propria; admin tutte.
drop policy if exists subscriptions_select_owner on public.subscriptions;
create policy subscriptions_select_owner on public.subscriptions
  for select to authenticated
  using (email = public.current_email() or public.is_admin());

-- ============================================================================
-- RPC get_active_discounts() — sconti a tempo attivi (per pricing/checkout).
-- ============================================================================
create or replace function public.get_active_discounts()
returns setof public.discounts
language sql
stable
security definer
set search_path = public
as $$
  select * from public.discounts
   where is_active and now() between starts_at and ends_at
   order by percent desc;
$$;

grant execute on function public.get_active_discounts() to anon, authenticated;

-- ============================================================================
-- RPC admin_orders_summary() — totali ordini pagati per la card Contabilità.
-- ============================================================================
create or replace function public.admin_orders_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.admin_orders_summary() to authenticated;

-- ============================================================================
-- Fine 0016_v440_checkout.sql
-- ============================================================================
