-- ============================================================================
-- v4.3.6 — Gestione Licenze & Security: stato 'revoked' bloccante + binding.
--
--   * activations.status guadagna il valore 'revoked' (revoca DEFINITIVA da WP):
--       pending  -> non ancora attivata su un dispositivo
--       active   -> attiva e legata all'HWID di un dispositivo
--       revoked  -> revocata: la DesktopApp si blocca PRIMA del login
--       suspended-> (legacy/admin) sospensione lato autore
--   * revoke_activation() ora porta lo stato a 'revoked' (blocco), MANTENENDO
--     hwid/token così la DesktopApp che fa polling vede 'revoked'. La
--     riattivazione richiede una NUOVA attivazione (nuovo token) — vedi nota.
--   * bind_activation() lega l'HWID SOLO in activations.hwid (la colonna
--     registrations.hardware_id è stata rimossa dallo schema) e restituisce il
--     piano (scaffolding: registrations.plan) così la DesktopApp lo memorizza in
--     environment.lks.
--   * validate_license() accetta p_app_version (sync versione dopo update) e
--     restituisce status (incl. 'revoked') + plan.
--
-- Helper riusati: public.current_email() (0001), public.is_admin() (0004).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Estendo il CHECK dello stato per includere 'revoked'.
-- ----------------------------------------------------------------------------
alter table public.activations
    drop constraint if exists activations_status_check;

alter table public.activations
    add constraint activations_status_check
    check (status in ('pending', 'active', 'revoked', 'suspended'));

-- ----------------------------------------------------------------------------
-- 2) revoke_activation — revoca BLOCCANTE dal pannello WebPlatform.
--    L'utente revoca la licenza di un proprio dispositivo: lo stato passa a
--    'revoked' e ci resta. Manteniamo hwid e token così la DesktopApp, al
--    prossimo controllo (validate_license con il token memorizzato), riceve
--    'revoked' e si blocca prima del login. Per riusare il dispositivo l'utente
--    genera una nuova attivazione (nuovo token, riga 'pending') dalla WP.
-- ----------------------------------------------------------------------------
create or replace function public.revoke_activation(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.activations;
begin
  select * into r from public.activations
   where id = p_id and email = public.current_email();

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Idempotente: una licenza già revocata resta tale.
  update public.activations
     set status = 'revoked'
   where id = r.id
   returning * into r;

  return jsonb_build_object('ok', true, 'status', r.status, 'hwid', r.hwid);
end;
$$;

grant execute on function public.revoke_activation(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) bind_activation — primo binding (HWID solo in activations.hwid) + ritorno
--    del piano. Firma invariata (uuid, text, text, text) → nessun impatto sui
--    client esistenti che non leggono i campi nuovi.
--    Una licenza 'revoked' non è ri-bindabile (serve un nuovo token).
--
--    NB: eliminiamo ESPLICITAMENTE ogni versione precedente (incl. eventuali
--    overload) prima di ricreare, così non può sopravvivere una vecchia copia
--    che scriveva ancora su registrations.hardware_id (colonna rimossa).
-- ----------------------------------------------------------------------------
drop function if exists public.bind_activation(uuid, text, text);
drop function if exists public.bind_activation(uuid, text, text, text);

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
  v_plan text;
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
    -- primo binding
    update public.activations
       set hwid = p_hwid, status = 'active', activated_at = now(),
           app_version = coalesce(p_app_version, app_version)
     where id = r.id
     returning * into r;
  elsif r.hwid = p_hwid then
    -- stesso dispositivo: idempotente (aggiorno solo l'eventuale versione)
    update public.activations
       set app_version = coalesce(p_app_version, app_version)
     where id = r.id
     returning * into r;
  else
    -- dispositivo diverso sullo stesso token: rifiuto
    return jsonb_build_object('ok', false, 'error', 'hwid_mismatch', 'status', r.status);
  end if;

  -- L'HWID del dispositivo vive UNICAMENTE in activations.hwid (impostato sopra):
  -- è la fonte di verità del binding. La colonna registrations.hardware_id è stata
  -- rimossa dallo schema, quindi qui NON si scrive più nulla su registrations.
  select plan into v_plan from public.registrations where email = p_email;

  return jsonb_build_object(
    'ok', true, 'status', r.status, 'email', r.email,
    'token', r.activation_token, 'hwid', r.hwid, 'activatedAt', r.activated_at,
    -- scaffolding piano: billingCycle/renewalEstimate restano null finché non
    -- esiste un modello di abbonamento (prodotto attualmente 'free').
    'plan', coalesce(v_plan, 'free'),
    'billingCycle', null,
    'renewalEstimate', null);
end;
$$;

grant execute on function public.bind_activation(uuid, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) validate_license — controllo periodico/at-boot. Aggiunto p_app_version per
--    sincronizzare la versione attiva dopo un aggiornamento. Ritorna status
--    (incl. 'revoked') e plan per l'eventuale refresh di environment.lks.
--    Firma a 3 argomenti rimossa e sostituita con la 4-arg (default null), così
--    i client che passano solo 3 valori continuano a funzionare.
-- ----------------------------------------------------------------------------
drop function if exists public.validate_license(uuid, text, text);

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
  r      public.activations;
  v_plan text;
begin
  select * into r from public.activations
   where activation_token = p_token and email = p_email;

  if not found then
    return jsonb_build_object('active', false, 'status', 'unknown',
      'email', p_email, 'token', p_token, 'hwid', p_hwid);
  end if;

  -- Sync versione attiva dopo un aggiornamento (solo se attiva su questo HWID).
  if p_app_version is not null and r.hwid is not distinct from p_hwid
     and r.status = 'active' then
    update public.activations set app_version = p_app_version
     where id = r.id returning * into r;
  end if;

  select plan into v_plan from public.registrations where email = p_email;

  return jsonb_build_object(
    'active', (r.hwid is not distinct from p_hwid and r.status = 'active'),
    'status', r.status, 'email', r.email, 'token', r.activation_token,
    'hwid', r.hwid, 'plan', coalesce(v_plan, 'free'),
    'billingCycle', null, 'renewalEstimate', null);
end;
$$;

grant execute on function public.validate_license(uuid, text, text, text) to anon, authenticated;

-- ============================================================================
-- OPS / Note
--   * Riattivazione dopo revoca: la WP crea una nuova attivazione 'pending'
--     (ensureActivation) con token nuovo; la riga 'revoked' resta come storico
--     e continua a bloccare il vecchio token. La DesktopApp, ribindando il
--     nuovo token, aggiorna anche environment.lks (email+token).
--   * Re-bind manuale di un dispositivo (admin): azzera l'hwid e riporta a
--     pending —  update public.activations
--                  set hwid = null, status = 'pending', activated_at = null
--                where activation_token = '...';
-- ============================================================================
