-- ============================================================================
-- 0018_v450_recurring_unlocks.sql
--
-- v4.5.x — Setup completo pagamenti:
--   * ordini LOCK con HWID del dispositivo (per generare l'unlock giusto).
--   * abbonamento ricorrente reale: id subscription del provider + flag auto_renew.
--   * unlock_files: i file di sblocco caricati DALL'ADMIN (mai generati dalle
--     Edge Functions), consegnati via email e scaricabili dall'utente.
--   * bucket storage privato 'unlocks' (admin scrive, utente legge i propri).
--
-- Lo storico ordini per /admin/contabilita e per la dashboard utente non richiede
-- nuove RPC: la policy orders_select_owner (0016) già consente all'admin di
-- vedere tutti gli ordini e all'utente i propri.
--
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- orders: HWID (lock) + riferimento subscription del provider (ricorrente).
-- ----------------------------------------------------------------------------
alter table public.orders add column if not exists hwid text;
alter table public.orders add column if not exists provider_subscription_id text;
alter table public.orders add column if not exists is_recurring boolean not null default false;

-- ----------------------------------------------------------------------------
-- subscriptions: ricorrenza.
-- ----------------------------------------------------------------------------
alter table public.subscriptions add column if not exists provider_subscription_id text;
alter table public.subscriptions add column if not exists auto_renew boolean not null default false;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;

create index if not exists idx_subscriptions_provider_sub on public.subscriptions(provider_subscription_id);

-- ----------------------------------------------------------------------------
-- unlock_files: un file di sblocco per un ordine LOCK pagato.
-- storage_path = percorso nel bucket 'unlocks' (formato <email>/<file>.lks).
-- ----------------------------------------------------------------------------
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
  'File di sblocco (unlock.lks) caricati dall''admin per gli ordini LOCK. Consegnati via email e scaricabili dall''utente.';

alter table public.unlock_files enable row level security;

-- L'utente vede i propri file; l'admin tutti.
drop policy if exists unlock_files_select on public.unlock_files;
create policy unlock_files_select on public.unlock_files
  for select to authenticated
  using (email = public.current_email() or public.is_admin());

-- Scrittura solo admin (upload/gestione).
drop policy if exists unlock_files_admin_write on public.unlock_files;
create policy unlock_files_admin_write on public.unlock_files
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Bucket storage privato 'unlocks'.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('unlocks', 'unlocks', false)
on conflict (id) do nothing;

-- Admin: upload/update/delete degli oggetti.
drop policy if exists unlocks_admin_insert on storage.objects;
create policy unlocks_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'unlocks' and public.is_admin());

drop policy if exists unlocks_admin_update on storage.objects;
create policy unlocks_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'unlocks' and public.is_admin())
  with check (bucket_id = 'unlocks' and public.is_admin());

drop policy if exists unlocks_admin_delete on storage.objects;
create policy unlocks_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'unlocks' and public.is_admin());

-- Utente: legge SOLO i propri oggetti (cartella = la sua email) → signed URL.
drop policy if exists unlocks_owner_select on storage.objects;
create policy unlocks_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'unlocks'
    and ((storage.foldername(name))[1] = public.current_email() or public.is_admin())
  );

-- ----------------------------------------------------------------------------
-- RPC mark_unlock_downloaded — l'utente segna il proprio unlock come scaricato.
-- ----------------------------------------------------------------------------
create or replace function public.mark_unlock_downloaded(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.unlock_files
     set status = 'downloaded', downloaded_at = now()
   where id = p_id
     and email = public.current_email()
     and status <> 'downloaded';
end;
$$;

grant execute on function public.mark_unlock_downloaded(uuid) to authenticated;

-- ============================================================================
-- Fine 0018_v450_recurring_unlocks.sql
-- ============================================================================
