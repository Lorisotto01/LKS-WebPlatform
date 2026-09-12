-- ============================================================================
-- 02_set_admin.sql — Promuove un utente ad ADMIN del gestionale.
--
-- L'admin sbloccca il pannello /admin: pubblicazione release, segnalazioni,
-- CMS della documentazione, analytics e contabilita'.
--
-- Come funziona: il ruolo viene scritto in auth.users.raw_app_meta_data, che
-- finisce nel claim `app_metadata` del JWT. public.is_admin() legge da li'.
-- app_metadata NON e' modificabile dal client (a differenza di user_metadata):
-- solo la service_role, la Dashboard o questo script possono cambiarlo, quindi
-- nessuno puo' auto-promuoversi dal browser.
--
-- ----------------------------------------------------------------------------
-- PREREQUISITO: l'utente deve gia' essersi REGISTRATO sul sito con quell'email.
-- Lo script promuove un account esistente, non ne crea uno.
--
-- COME SI ESEGUE (Supabase -> SQL Editor -> New query)
--   1. Metti l'email giusta nella riga `set slk.admin_email` qui sotto.
--   2. Incolla tutto ed esegui.
--   3. Sul sito: LOGOUT e poi LOGIN. Senza questo passaggio il JWT in tasca
--      e' ancora quello vecchio e il bottone "Admin" non compare.
--
-- Rieseguibile quante volte vuoi. Per promuovere piu' persone, cambia l'email
-- e riesegui: non toglie il ruolo a nessuno.
-- ----------------------------------------------------------------------------

-- >>> EMAIL DELL'ACCOUNT DA RENDERE ADMIN <<<
set slk.admin_email = 'admin@sottolab.it';


do $admin$
declare
  v_email text := lower(btrim(coalesce(current_setting('slk.admin_email', true), '')));
  v_id    uuid;
  v_plan  text;
begin
  -- 1. Validazione dell'input -----------------------------------------------
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Email non valida o non impostata.',
      hint    = 'Correggi la riga:  set slk.admin_email = ''tua@email.it'';  in cima al file.';
  end if;

  -- 2. L'account deve esistere ----------------------------------------------
  select id into v_id from auth.users where lower(email) = v_email;

  if v_id is null then
    raise exception using
      errcode = 'P0002',
      message = format('Nessun account registrato con l''email %s.', v_email),
      hint    = 'Registrati prima sul sito con quell''indirizzo, poi riesegui questo script.';
  end if;

  -- 3. Promozione ------------------------------------------------------------
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || '{"role":"admin"}'::jsonb
   where id = v_id;

  raise notice 'OK: % (id %) e'' ora admin.', v_email, v_id;

  -- 4. Riga in registrations -------------------------------------------------
  -- Di norma la crea l'app al primo login. La creiamo qui se manca, cosi' subito
  -- dopo un azzeramento l'admin compare nei conteggi di /admin/contabilita.
  -- Richiede che la migration 0001 sia gia' stata applicata.
  if to_regclass('public.registrations') is null then
    raise notice 'Attenzione: public.registrations non esiste. Applica prima le migration.';
    return;
  end if;

  insert into public.registrations (email, plan)
  values (v_email, 'free')
  on conflict (email) do nothing;

  select plan into v_plan from public.registrations where email = v_email;
  raise notice 'Riga registrations presente per % (piano: %).', v_email, v_plan;
end
$admin$;

reset slk.admin_email;

-- ============================================================================
-- VERIFICA — chi e' admin adesso?
-- Esegui questa query da sola per controllare il risultato.
-- ============================================================================
select
    u.email,
    (u.raw_app_meta_data ->> 'role') as ruolo,
    u.created_at
from auth.users u
where u.raw_app_meta_data ->> 'role' = 'admin'
order by u.created_at;

-- ============================================================================
-- PER TOGLIERE il ruolo a qualcuno (decommenta e metti l'email giusta):
--
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data - 'role'
--    where lower(email) = 'ex.admin@esempio.it';
--
-- Anche qui serve LOGOUT + LOGIN perche' il cambiamento abbia effetto.
-- ============================================================================
