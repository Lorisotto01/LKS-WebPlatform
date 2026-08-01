-- ============================================================================
-- 0020_v461_report_lock_text_ts.sql
--
-- v4.6.1 — Robustezza di report_lock: PostgREST risolve le funzioni per nome +
-- nomi-argomento e può rifiutare (404/400) una firma con parametro timestamptz
-- passato come stringa. Passiamo occorred_at come TEXT e castiamo internamente,
-- così la RPC è sempre risolvibile con la anon key dalla DesktopApp.
--
-- Rimuove esplicitamente la vecchia firma (…, timestamptz) prima di ricreare.
-- Idempotente.
-- ============================================================================

drop function if exists public.report_lock(text, text, text, text, text, timestamptz);

create or replace function public.report_lock(
    p_hwid            text,
    p_lock_type       text,
    p_email           text default null,
    p_app_version     text default null,
    p_client_event_id text default null,
    p_occurred_at     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_ts  timestamptz;
begin
  if p_hwid is null or p_hwid = '' or p_lock_type not in ('env', 'perm') then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;

  begin
    v_ts := coalesce(nullif(p_occurred_at, '')::timestamptz, now());
  exception when others then
    v_ts := now(); -- data non valida → adesso
  end;

  insert into public.lock_events (hwid, email, lock_type, app_version, client_event_id, occurred_at)
  values (p_hwid, nullif(p_email, ''), p_lock_type, p_app_version,
          nullif(p_client_event_id, ''), v_ts)
  on conflict (client_event_id) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.report_lock(text, text, text, text, text, text) to anon, authenticated;

-- ============================================================================
-- Fine 0020_v461_report_lock_text_ts.sql
-- ============================================================================
