-- ============================================================================
-- 0009_v500_lock_rename.sql — ENV_LOCK / PERMANENT_LOCK diventano
-- INTEGRITY_LOCK / SECURITY_LOCK (task 869fbc80b, v5.0.0).
--
-- Va applicata SOPRA un database che ha gia' eseguito 0001-0008. Idempotente:
-- si puo' rieseguire senza effetti (rinomine e update condizionati).
--
-- COSA CAMBIA
--   * codici interni  'env'  -> 'integrity'   'perm' -> 'security'
--     su orders.lock_type, unlock_files.lock_type, lock_events.lock_type
--   * colonne prezzi  plans.env_lock_cents  -> integrity_lock_cents
--                     plans.perm_lock_cents -> security_lock_cents
--   * testi della guida (doc_blocks) con i nuovi nomi
--   * nuova RPC active_lock(hwid, token): restituisce i codici 5.0
--
-- COMPATIBILITA' CON LE DESKTOPAPP 4.x ANCORA INSTALLATE
-- La 5.0.0 e' un aggiornamento obbligatorio (releases.min_version = '5.0.0'),
-- ma un dispositivo 4.x bloccato puo' non riuscire ad aggiornarsi prima di
-- essere sbloccato. Per questo:
--   * report_lock accetta ancora 'env'/'perm' e li converte;
--   * active_lock_type (usata SOLO dalle 4.x) continua a restituire 'env'/'perm',
--     perche' la 4.x confronta letteralmente "env".equals(...);
--   * il checkout continua ad accettare ?lock=env|perm (vedi create-checkout).
-- ============================================================================

-- 1. Colonne dei prezzi -------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'plans' and column_name = 'env_lock_cents') then
    alter table public.plans rename column env_lock_cents to integrity_lock_cents;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'plans' and column_name = 'perm_lock_cents') then
    alter table public.plans rename column perm_lock_cents to security_lock_cents;
  end if;
end $$;

-- 2. Codici lock_type ---------------------------------------------------------
alter table public.orders       drop constraint if exists orders_lock_type_check;
alter table public.unlock_files drop constraint if exists unlock_files_lock_type_check;
alter table public.lock_events  drop constraint if exists lock_events_lock_type_check;

update public.orders       set lock_type = 'integrity' where lock_type = 'env';
update public.orders       set lock_type = 'security'  where lock_type = 'perm';
update public.unlock_files set lock_type = 'integrity' where lock_type = 'env';
update public.unlock_files set lock_type = 'security'  where lock_type = 'perm';
update public.lock_events  set lock_type = 'integrity' where lock_type = 'env';
update public.lock_events  set lock_type = 'security'  where lock_type = 'perm';

alter table public.orders       add constraint orders_lock_type_check
  check (lock_type in ('integrity', 'security'));
alter table public.unlock_files add constraint unlock_files_lock_type_check
  check (lock_type in ('integrity', 'security'));
alter table public.lock_events  add constraint lock_events_lock_type_check
  check (lock_type in ('integrity', 'security'));

-- 3. Conversione dei codici 4.x ------------------------------------------------
create or replace function public.normalize_lock_type(p text)
returns text
language sql immutable as $fn$
  select case p when 'env' then 'integrity' when 'perm' then 'security' else p end;
$fn$;

-- 4. RPC ----------------------------------------------------------------------
-- Stessa firma della 0007: create or replace mantiene i grant esistenti.
create or replace function public.report_lock(
    p_hwid            text,
    p_lock_type       text,
    p_token           uuid,
    p_email           text default null,
    p_app_version     text default null,
    p_client_event_id text default null,
    p_occurred_at     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_id    uuid;
  v_ts    timestamptz;
  v_email text;
  v_type  text := public.normalize_lock_type(p_lock_type);
begin
  if p_hwid is null or p_hwid = '' or v_type is null or v_type not in ('integrity', 'security') then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;

  -- Prova di possesso del dispositivo: il token deve essere attivo e legato a p_hwid.
  v_email := public.device_email(p_token, p_hwid);
  if v_email is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  begin
    v_ts := coalesce(nullif(p_occurred_at, '')::timestamptz, now());
  exception when others then
    v_ts := now();   -- data non valida -> adesso
  end;

  insert into public.lock_events (hwid, email, lock_type, app_version, client_event_id, occurred_at)
  values (p_hwid, v_email, v_type, p_app_version,
          nullif(p_client_event_id, ''), v_ts)
  on conflict (client_event_id) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;

grant execute on function public.report_lock(text, text, uuid, text, text, text, text) to anon, authenticated;

-- Nuova RPC 5.0: blocco non risolto piu' recente, con i codici nuovi.
create or replace function public.active_lock(p_hwid text, p_token uuid)
returns text
language plpgsql stable security definer set search_path = public as $fn$
declare v_type text;
begin
  if public.device_email(p_token, p_hwid) is null then
    return null;   -- nessuna prova di possesso: nessuna informazione sul dispositivo
  end if;
  select lock_type into v_type
    from public.lock_events
   where hwid = p_hwid and not resolved
   order by occurred_at desc
   limit 1;
  return v_type;
end;
$fn$;

grant execute on function public.active_lock(text, uuid) to anon, authenticated;

-- Solo per le DesktopApp 4.x: stessi dati, codici legacy.
create or replace function public.active_lock_type(p_hwid text, p_token uuid)
returns text
language sql stable security definer set search_path = public as $fn$
  select case t when 'integrity' then 'env' when 'security' then 'perm' else t end
    from (select public.active_lock(p_hwid, p_token) as t) s;
$fn$;

grant execute on function public.active_lock_type(text, uuid) to anon, authenticated;

-- 5. Testi della guida --------------------------------------------------------
update public.doc_blocks
   set content = replace(replace(content::text, 'ENV_LOCK', 'INTEGRITY_LOCK'),
                         'PERMANENT_LOCK', 'SECURITY_LOCK')::jsonb
 where content::text like '%ENV_LOCK%' or content::text like '%PERMANENT_LOCK%';
