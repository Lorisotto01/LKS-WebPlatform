-- ============================================================================
-- 0007_security_hardening.sql — Chiusura dei rilievi dell'analisi vulnerabilita'
-- (task 869f13awr, v4.8.2).
--
-- Va applicata SOPRA un database che ha gia' eseguito 0001-0006: ridefinisce
-- policy e funzioni esistenti senza toccare i dati. Idempotente.
--
-- Rilievi chiusi qui:
--   C3  resolve_locks()          esposta ad anon senza autenticazione
--   C4  registrations.plan       non protetto nella policy di INSERT
--   A1  list_my_reports()        IDOR sulle segnalazioni di qualsiasi email
--   A7  stripe-webhook           replay degli eventi (tabella di deduplica)
--   M4  report_lock()            blocco di un dispositivo di terzi via HWID arbitrario
--   M5  report-attachments       INSERT anonima illimitata nel bucket
--   M6  releases (storage)       anon con SELECT su TUTTI gli oggetti del bucket
--   M13 activations_insert_self  righe di attivazione arbitrarie (status/hwid)
--
-- NOTA SUL CONTRATTO CLIENT — le RPC di blocco cambiano firma (nuovo argomento
-- p_token). PostgREST risolve le funzioni per nome + nomi degli argomenti, quindi
-- le firme precedenti vengono rimosse esplicitamente: una DesktopApp <= 4.8.1 non
-- riesce piu' a scrivere/leggere lo stato di blocco lato server e ricade sul
-- percorso "offline" gia' previsto (coda locale, nessun blocco dell'app).
-- ============================================================================

-- ============================================================================
-- 1. HELPER — autenticazione del dispositivo tramite activation_token
-- ============================================================================
-- Ritorna l'email legata al token SOLO se il token esiste, e' attivo e (quando
-- l'HWID e' passato) e' legato proprio a quel dispositivo. NULL in ogni altro
-- caso. Centralizza il controllo usato dalle RPC anonime della DesktopApp.
create or replace function public.device_email(p_token uuid, p_hwid text default null)
returns text
language sql stable security definer set search_path = public as $fn$
  select a.email
    from public.activations a
   where a.activation_token = p_token
     and a.status = 'active'
     and (p_hwid is null or a.hwid = p_hwid)
   limit 1;
$fn$;

comment on function public.device_email(uuid, text) is
  'Email dell attivazione legata a (token[, hwid]) se attiva, altrimenti NULL. Helper interno delle RPC anon.';

-- Non esposta ai client: la usano solo le altre funzioni SECURITY DEFINER.
revoke all on function public.device_email(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- 2. C4 — registrations: la riga si crea SOLO sul piano 'free'
-- ============================================================================
-- La policy precedente vincolava solo l'email, lasciando al browser il controllo
-- completo del payload: bastava insert({ email, plan: 'pro' }) per ottenere un
-- piano a pagamento permanente. Il piano puo' essere alzato solo da service_role
-- (finalizeOrder nelle Edge Function) o dalle RPC SECURITY DEFINER.
drop policy if exists registrations_insert_self on public.registrations;
create policy registrations_insert_self on public.registrations
    for insert to authenticated
    with check (email = public.current_email() and plan = 'free');

-- Rete di sicurezza sul pregresso: chi si e' gia' assegnato un piano a pagamento
-- senza un ordine pagato viene riportato a 'free'. Le righe con un abbonamento
-- reale (subscription attiva e non scaduta) o con un ordine 'paid' a catalogo
-- non vengono toccate.
update public.registrations r
   set plan = 'free'
 where r.plan <> 'free'
   and not exists (
     select 1 from public.subscriptions s
      where s.email = r.email
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now()))
   and not exists (
     select 1 from public.orders o
      where o.email = r.email
        and o.kind = 'subscription'
        and o.status = 'paid');

-- ============================================================================
-- 3. M13 — activations: l'utente non conia righe di attivazione arbitrarie
-- ============================================================================
-- Prima la policy vincolava solo l'email: era possibile inserire righe gia'
-- 'active' e gia' legate a un HWID scelto. Ora l'utente puo' solo richiedere una
-- nuova attivazione 'pending' non ancora legata ad alcun dispositivo; il binding
-- lo esegue bind_activation() (SECURITY DEFINER) al primo avvio.
drop policy if exists activations_insert_self on public.activations;
create policy activations_insert_self on public.activations
    for insert to authenticated
    with check (
      email = public.current_email()
      and status = 'pending'
      and hwid is null
    );

-- ============================================================================
-- 4. C3 + M4 — RPC di blocco autenticate con l'activation_token
-- ============================================================================
-- Le tre RPC accettavano un HWID arbitrario senza alcuna prova di possesso del
-- dispositivo: con la sola anon key (pubblica, presente nel bundle web e nel jar)
-- era possibile risolvere i blocchi di chiunque (C3) o bloccare il dispositivo di
-- un terzo di cui si conoscesse l'HWID (M4). Ora ogni chiamata richiede un
-- activation_token attivo e legato proprio a quell'HWID.
drop function if exists public.report_lock(text, text, text, text, text, text);
drop function if exists public.active_lock_type(text);
drop function if exists public.resolve_locks(text);

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
begin
  if p_hwid is null or p_hwid = '' or p_lock_type not in ('env', 'perm') then
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

  -- L'email registrata e' quella dell'attivazione, non quella inviata dal client.
  insert into public.lock_events (hwid, email, lock_type, app_version, client_event_id, occurred_at)
  values (p_hwid, v_email, p_lock_type, p_app_version,
          nullif(p_client_event_id, ''), v_ts)
  on conflict (client_event_id) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;

grant execute on function public.report_lock(text, text, uuid, text, text, text, text) to anon, authenticated;

create or replace function public.active_lock_type(p_hwid text, p_token uuid)
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

grant execute on function public.active_lock_type(text, uuid) to anon, authenticated;

-- Segna risolti i blocchi di un HWID dopo uno sblocco valido. Non concede
-- accesso locale: il device resta bloccato finche' non passa lo sblocco vero
-- (master password o unlock.lks firmato).
create or replace function public.resolve_locks(p_hwid text, p_token uuid)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if public.device_email(p_token, p_hwid) is null then
    return 0;
  end if;
  update public.lock_events
     set resolved = true, resolved_at = now()
   where hwid = p_hwid and not resolved;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

grant execute on function public.resolve_locks(text, uuid) to anon, authenticated;

-- ============================================================================
-- 5. A1 — list_my_reports: niente piu' filtro sull'email inviata dal client
-- ============================================================================
-- Prima la funzione filtrava solo sui parametri del chiamante: con la anon key e
-- un'email qualsiasi si leggevano titolo, descrizione, nota interna dell'admin e
-- i path degli allegati delle segnalazioni altrui. Ora:
--   * utente autenticato  -> sempre e solo le proprie (current_email());
--   * DesktopApp (anon)   -> le segnalazioni di questa installazione (p_hwid, che
--     e' un UUID casuale generato per-installazione) e, se passa un
--     activation_token valido, anche quelle aperte con l'email di quel token.
-- p_email resta nella firma per compatibilita' ma NON viene piu' usato per
-- filtrare: era il parametro che rendeva possibile l'IDOR.
drop function if exists public.list_my_reports(text, text);

create or replace function public.list_my_reports(
    p_email text default null,   -- ignorato: mantenuto solo per compatibilita' di firma
    p_hwid  text default null,
    p_token uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_caller text := public.current_email();
  v_device text := case when p_token is null then null else public.device_email(p_token) end;
begin
  return coalesce((
    select jsonb_agg(q order by q.created_at desc)
    from (
      select
        r.id, r.tipo, r.titolo, r.descrizione, r.app_version,
        r.status, r.admin_note, r.created_at,
        coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', a.id, 'path', a.path, 'filename', a.filename,
                   'content_type', a.content_type, 'size_bytes', a.size_bytes)
                 order by a.created_at)
          from public.report_attachments a
          where a.report_id = r.id
        ), '[]'::jsonb) as attachments
      from public.reports r
      where
        -- Sessione web autenticata: solo le proprie.
        (v_caller is not null and r.email = v_caller)
        -- DesktopApp: le segnalazioni aperte da questa installazione.
        or (v_caller is null and p_hwid is not null and r.hwid = p_hwid
            and (r.email is null or v_device is null or r.email = v_device))
        -- DesktopApp con licenza attiva: anche quelle aperte con la stessa email.
        or (v_caller is null and v_device is not null and r.email = v_device)
    ) q
  ), '[]'::jsonb);
end;
$fn$;

grant execute on function public.list_my_reports(text, text, uuid) to anon, authenticated;

-- ============================================================================
-- 6. M5 — report-attachments: upload anonimo solo dentro una segnalazione reale
-- ============================================================================
-- La policy accettava qualunque INSERT anonima nel bucket: bastava un ciclo per
-- riempire lo storage. Ora il primo segmento del path deve essere l'id di una
-- segnalazione esistente e recente (stessa convenzione gia' imposta da
-- attach_report_file), quindi ogni upload deve seguire una segnalazione vera.
drop policy if exists report_attach_anon_insert on storage.objects;
create policy report_attach_anon_insert on storage.objects
    for insert to anon, authenticated
    with check (
      bucket_id = 'report-attachments'
      and (storage.foldername(name))[1] is not null
      and exists (
        select 1 from public.reports r
         where r.id::text = (storage.foldername(name))[1]
           and r.created_at > now() - interval '1 day'
      )
    );

-- ============================================================================
-- 7. M6 — releases: nessun accesso diretto agli oggetti del bucket
-- ============================================================================
-- Il bucket concedeva SELECT ad `anon` su tutti i suoi oggetti, perche' la
-- DesktopApp si firmava da se' il link di download con la anon key. Ma la anon
-- key e' pubblica (sta nel bundle web e dentro il jar), quindi quel grant
-- equivaleva a rendere l'intero bucket leggibile a chiunque: enumerazione degli
-- oggetti e download diretto, saltando sia il signed URL sia l'audit in
-- `downloads`.
--
-- Da 4.8.2 il grant non esiste piu' per nessun ruolo se non l'admin: l'unico
-- modo per ottenere un link e' la Edge Function `release-download`, che gira con
-- service_role, identifica il chiamante (JWT utente oppure activation_token del
-- dispositivo), firma solo release attive e registra il download.
drop policy if exists releases_objects_read_anon on storage.objects;

drop policy if exists releases_objects_read on storage.objects;
create policy releases_objects_read on storage.objects
    for select to authenticated
    using (bucket_id = 'releases' and public.is_admin());


-- ============================================================================
-- 8. A7 — deduplica degli eventi webhook (anti-replay)
-- ============================================================================
-- finalizeOrder e' idempotente, recordRenewal no: ogni replay di invoice.paid
-- estendeva il periodo di un altro mese/anno. La chiave primaria sull'id evento
-- del provider rende ogni evento processabile una sola volta.
create table if not exists public.webhook_events (
    provider     text not null check (provider in ('stripe', 'paypal')),
    event_id     text not null,
    event_type   text,
    received_at  timestamptz not null default now(),
    primary key (provider, event_id)
);

comment on table public.webhook_events is
  'Eventi webhook gia processati: chiave di idempotenza contro i replay. Scritta solo da service_role.';

alter table public.webhook_events enable row level security;
-- Nessuna policy: accessibile esclusivamente a service_role (che bypassa la RLS).

create index if not exists idx_webhook_events_received on public.webhook_events(received_at);

-- Retention: gli eventi piu' vecchi di 90 giorni non servono piu' alla deduplica
-- (nessun provider ritenta oltre pochi giorni).
create or replace function public.purge_old_webhook_events(p_days int default 90)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare v_deleted integer;
begin
  delete from public.webhook_events where received_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

revoke all on function public.purge_old_webhook_events(int) from public, anon, authenticated;

do $mig$
begin
  perform cron.unschedule('purge_old_webhook_events_daily')
   where exists (select 1 from cron.job where jobname = 'purge_old_webhook_events_daily');
  perform cron.schedule('purge_old_webhook_events_daily', '45 3 * * *',
                        'select public.purge_old_webhook_events(90);');
exception when others then
  raise notice 'pg_cron non disponibile: schedula purge_old_webhook_events a mano (%).', sqlerrm;
end
$mig$;

-- ============================================================================
-- Fine 0007_security_hardening.sql
-- ============================================================================
