-- ============================================================================
-- 0017_v442_subscription_expiry.sql
--
-- v4.4.x — Collega le RPC di licenza all'abbonamento reale e introduce la
-- SCADENZA con declassamento automatico a Free.
--
-- Prima d'ora bind_activation/validate_license restituivano billingCycle e
-- renewalEstimate = null (scaffolding pre-pagamenti), quindi environment.lks non
-- veniva mai popolato. Ora leggiamo da public.subscriptions (0016):
--
--   * piano EFFETTIVO: se l'abbonamento è scaduto (current_period_end < now)
--     l'utente torna a 'free' — registrations.plan viene declassato e la
--     subscription marcata 'expired' (idempotente). Così l'app, al prossimo
--     avvio online, riceve 'free' e blocca le funzionalità a pagamento.
--   * billingCycle: 'mensile' / 'annuale' (mappato da billing_cycle).
--   * renewalEstimate: data di rinnovo (YYYY-MM-DD) — usata anche dal Desktop
--     per il blocco OFFLINE alla scadenza.
--
-- Helper condiviso public.effective_plan_info(email) usato da entrambe le RPC.
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: calcola il piano effettivo + info fatturazione per un'email.
-- Effettua il declassamento a 'free' se l'abbonamento è scaduto (SECURITY DEFINER).
-- Ritorna: { plan, billingCycle, renewalEstimate }
-- ----------------------------------------------------------------------------
create or replace function public.effective_plan_info(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg_plan text;
  s          public.subscriptions;
  v_cycle    text;
  v_renew    text;
begin
  select plan into v_reg_plan from public.registrations where email = p_email;
  v_reg_plan := coalesce(v_reg_plan, 'free');

  select * into s from public.subscriptions where email = p_email;

  -- Nessun abbonamento tracciato → si usa registrations.plan così com'è.
  if not found then
    return jsonb_build_object('plan', v_reg_plan, 'billingCycle', null, 'renewalEstimate', null);
  end if;

  v_cycle := case s.billing_cycle when 'year' then 'annuale' when 'month' then 'mensile' else null end;
  v_renew := to_char(s.current_period_end, 'YYYY-MM-DD');

  -- Scaduto → declassa a free (idempotente) e restituisci free.
  if s.current_period_end is not null and s.current_period_end < now() then
    if v_reg_plan <> 'free' then
      update public.registrations set plan = 'free' where email = p_email;
    end if;
    if s.status = 'active' then
      update public.subscriptions set status = 'expired', updated_at = now() where email = p_email;
    end if;
    return jsonb_build_object('plan', 'free', 'billingCycle', null, 'renewalEstimate', null);
  end if;

  -- Abbonamento attivo e valido.
  if s.status = 'active' then
    return jsonb_build_object('plan', s.plan_code, 'billingCycle', v_cycle, 'renewalEstimate', v_renew);
  end if;

  -- Stati non attivi (canceled/expired) → free.
  return jsonb_build_object('plan', 'free', 'billingCycle', null, 'renewalEstimate', null);
end;
$$;

grant execute on function public.effective_plan_info(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- bind_activation — ora restituisce piano effettivo + billingCycle/renewalEstimate.
-- Firma invariata (uuid, text, text, text).
-- ----------------------------------------------------------------------------
create or replace function public.bind_activation(
    p_token       uuid,
    p_email       text,
    p_hwid        text,
    p_app_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r    public.activations;
  info jsonb;
begin
  select * into r from public.activations
   where activation_token = p_token and email = p_email;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_not_found');
  end if;
  if r.status = 'suspended' then
    return jsonb_build_object('ok', false, 'error', 'suspended', 'status', r.status);
  end if;
  if r.status = 'revoked' then
    return jsonb_build_object('ok', false, 'error', 'revoked', 'status', r.status);
  end if;

  if r.hwid is null then
    update public.activations
       set hwid = p_hwid, status = 'active', activated_at = now(),
           app_version = coalesce(p_app_version, app_version)
     where id = r.id returning * into r;
  elsif r.hwid = p_hwid then
    update public.activations
       set app_version = coalesce(p_app_version, app_version)
     where id = r.id returning * into r;
  else
    return jsonb_build_object('ok', false, 'error', 'hwid_mismatch', 'status', r.status);
  end if;

  info := public.effective_plan_info(p_email);

  return jsonb_build_object(
    'ok', true, 'status', r.status, 'email', r.email,
    'token', r.activation_token, 'hwid', r.hwid, 'activatedAt', r.activated_at,
    'plan', info->>'plan',
    'billingCycle', info->>'billingCycle',
    'renewalEstimate', info->>'renewalEstimate');
end;
$$;

grant execute on function public.bind_activation(uuid, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- validate_license — piano effettivo + billingCycle/renewalEstimate. Chiamata
-- at-boot dalla DesktopApp: qui avviene il declassamento alla scadenza.
-- ----------------------------------------------------------------------------
create or replace function public.validate_license(
    p_token       uuid,
    p_email       text,
    p_hwid        text,
    p_app_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r    public.activations;
  info jsonb;
begin
  select * into r from public.activations
   where activation_token = p_token and email = p_email;

  if not found then
    return jsonb_build_object('active', false, 'status', 'unknown',
      'email', p_email, 'token', p_token, 'hwid', p_hwid);
  end if;

  if p_app_version is not null and r.hwid is not distinct from p_hwid
     and r.status = 'active' then
    update public.activations set app_version = p_app_version
     where id = r.id returning * into r;
  end if;

  info := public.effective_plan_info(p_email);

  return jsonb_build_object(
    'active', (r.hwid is not distinct from p_hwid and r.status = 'active'),
    'status', r.status, 'email', r.email, 'token', r.activation_token,
    'hwid', r.hwid,
    'plan', info->>'plan',
    'billingCycle', info->>'billingCycle',
    'renewalEstimate', info->>'renewalEstimate');
end;
$$;

grant execute on function public.validate_license(uuid, text, text, text) to anon, authenticated;

-- ============================================================================
-- Fine 0017_v442_subscription_expiry.sql
-- ============================================================================
