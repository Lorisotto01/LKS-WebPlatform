-- ============================================================================
-- v4.3.4 (iterazione 2) — Docs CMS a blocchi + revoca licenza utente.
--
--   * doc_settings        -> impostazioni della pagina /docs (titolo, numerazione)
--   * doc_blocks          -> contenuti /docs come blocchi ordinati e riordinabili
--   * revoke_activation() -> l'utente scollega il device, revoca e RIGENERA il token
--
-- Helper riusati: public.is_admin() (0004), public.current_email() (0001).
-- Bucket 'assets' (0010) già pubblico: la sezione Media usa il prefisso 'docs/'.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) doc_settings — singleton (id = 1)
-- ----------------------------------------------------------------------------
create table if not exists public.doc_settings (
    id             smallint primary key default 1,
    page_title     text not null default 'Guida a SecureLocalShare',
    page_subtitle  text,
    show_index     boolean not null default true,
    show_numbering boolean not null default true,
    updated_at     timestamptz not null default now(),
    constraint doc_settings_singleton check (id = 1)
);

alter table public.doc_settings enable row level security;

drop policy if exists doc_settings_read on public.doc_settings;
create policy doc_settings_read on public.doc_settings
    for select to anon, authenticated using (true);

drop policy if exists doc_settings_admin_write on public.doc_settings;
create policy doc_settings_admin_write on public.doc_settings
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.doc_settings (id, page_title, page_subtitle)
values (1, 'Guida a SecureLocalShare',
        'Come installare e usare SecureLocalShare: il tuo password manager che vive sulla tua rete di casa, senza cloud e senza abbonamenti.')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2) doc_blocks — blocchi ordinati (editor drag&drop)
--    content jsonb dipende dal tipo:
--      title     { "text": "...", "icon": "ShieldCheck" }
--      paragraph { "text": "... markdown inline ..." }
--      image     { "url": "...", "alt": "...", "caption": "..." }
--      note      { "text": "..." }
--      warning   { "text": "..." }
--      list      { "ordered": false, "items": ["...", "..."] }
--      table     { "header": true, "rows": [["a","b"],["c","d"]] }
--      code      { "lang": "bash", "code": "..." }
--      divider   {}
-- ----------------------------------------------------------------------------
create table if not exists public.doc_blocks (
    id         uuid primary key default gen_random_uuid(),
    position   double precision not null default 0,
    type       text not null default 'paragraph'
                 check (type in ('title','paragraph','image','note','warning','list','table','code','divider')),
    content    jsonb not null default '{}'::jsonb,
    visible    boolean not null default true,
    updated_at timestamptz not null default now()
);

create index if not exists idx_doc_blocks_position on public.doc_blocks(position);

alter table public.doc_blocks enable row level security;

-- Lettura pubblica solo dei blocchi visibili; l'admin vede e gestisce tutto.
drop policy if exists doc_blocks_read on public.doc_blocks;
create policy doc_blocks_read on public.doc_blocks
    for select to anon, authenticated using (visible or public.is_admin());

drop policy if exists doc_blocks_admin_write on public.doc_blocks;
create policy doc_blocks_admin_write on public.doc_blocks
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.doc_blocks_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_doc_blocks_touch on public.doc_blocks;
create trigger trg_doc_blocks_touch before update on public.doc_blocks
    for each row execute function public.doc_blocks_touch();

-- ----------------------------------------------------------------------------
-- 2b) Seed iniziale dei blocchi (riprende i contenuti della /docs statica).
--     Eseguito solo se la tabella è vuota, così non sovrascrive le modifiche.
-- ----------------------------------------------------------------------------
insert into public.doc_blocks (position, type, content)
select * from (values
  (10::float8,  'title',     '{"text":"1. Cos''è e come funziona","icon":"ShieldCheck"}'::jsonb),
  (20,  'paragraph', '{"text":"SecureLocalShare (LKS) è un gestore di password e file **locale**: i tuoi dati non finiscono mai su un cloud. Su un computer di casa (il PC host) installi l''app Desktop, che custodisce i dati cifrati e avvia un piccolo server sulla tua rete. Dagli altri dispositivi apri la Web App dal browser, restando sempre dentro la rete locale."}'::jsonb),
  (30,  'title',     '{"text":"2. Requisiti","icon":"MonitorDown"}'::jsonb),
  (40,  'list',      '{"ordered":false,"items":["PC host: Windows 10 o 11 (64-bit). Java è già incluso nell''installer.","Altri dispositivi: un browser moderno sulla stessa rete del PC host.","Account: una registrazione gratuita su questo sito per scaricare l''app."]}'::jsonb),
  (50,  'title',     '{"text":"3. Installazione e primo avvio","icon":"Download"}'::jsonb),
  (60,  'list',      '{"ordered":true,"items":["Registrati e scarica l''eseguibile dalla dashboard.","Avvia l''app sul PC host.","Attiva il dispositivo con email e codice di attivazione.","Crea la master password (non è recuperabile: custodiscila bene)."]}'::jsonb),
  (70,  'title',     '{"text":"4. L''app Desktop (il cuore del sistema)","icon":"Server"}'::jsonb),
  (80,  'paragraph', '{"text":"Tenendola aperta sul PC host, l''app custodisce il **vault cifrato**, avvia il **server** che pubblica la Web App sulla rete locale e gestisce utenti, accessi e aggiornamenti. Quando chiudi l''app il server si ferma e i dati non sono più raggiungibili dagli altri dispositivi."}'::jsonb),
  (90,  'title',     '{"text":"5. Accedere dagli altri dispositivi","icon":"Smartphone"}'::jsonb),
  (100, 'paragraph', '{"text":"Dagli altri dispositivi non serve installare nulla: apri il browser e vai all''indirizzo del PC host sulla rete locale, porta 9505."}'::jsonb),
  (110, 'code',      '{"lang":"text","code":"http://INDIRIZZO-IP-DEL-PC:9505"}'::jsonb),
  (120, 'title',     '{"text":"6. Cosa puoi fare","icon":"KeyRound"}'::jsonb),
  (130, 'list',      '{"ordered":false,"items":["Password: salva credenziali in categorie, copia, mostra/nascondi, modifica.","Condivisione cifrata tra utenti della stessa rete.","LocalDrop: file e note ritrovabili da ogni dispositivo.","Notifiche quando qualcuno condivide qualcosa con te."]}'::jsonb),
  (140, 'title',     '{"text":"7. Il collegamento tra Web App e Desktop","icon":"Wifi"}'::jsonb),
  (150, 'paragraph', '{"text":"La Web App e l''app Desktop parlano tra loro **solo sulla rete locale**. Il browser e il server condividono la stessa origine, quindi nessun dato passa da server esterni e le richieste da fuori rete vengono rifiutate."}'::jsonb),
  (160, 'title',     '{"text":"8. Sicurezza e privacy","icon":"Lock"}'::jsonb),
  (170, 'list',      '{"ordered":false,"items":["I vault sono cifrati con AES-256-GCM: in chiaro non finisce nulla su disco.","La master password protegge tutto e non è recuperabile.","Nessun cloud, nessun server di terze parti vede le tue credenziali.","L''identificativo del dispositivo serve solo a legare la licenza al PC host."]}'::jsonb),
  (180, 'title',     '{"text":"9. Aggiornamenti, blocco e attivazione","icon":"RefreshCw"}'::jsonb),
  (190, 'paragraph', '{"text":"L''app controlla da sé le nuove versioni e ti guida nell''installarle. Ogni PC host va attivato una volta col codice della dashboard. In caso di manomissioni o troppi tentativi falliti l''app può bloccarsi: esistono due tipi di blocco."}'::jsonb),
  (200, 'warning',   '{"text":"ENV_LOCK (manomissione di environment.lks): il proprietario ripristina con la master password — che per sicurezza azzera le credenziali — oppure applicando un unlock.lks firmato dall''autore."}'::jsonb),
  (210, 'warning',   '{"text":"PERMANENT_LOCK (10 tentativi falliti): sblocco solo con un unlock.lks firmato dall''autore, verificato per firma, hardware ID e scadenza."}'::jsonb),
  (220, 'title',     '{"text":"10. Problemi comuni (FAQ)","icon":"HelpCircle"}'::jsonb),
  (230, 'list',      '{"ordered":false,"items":["Web App irraggiungibile dal telefono: stessa rete, app avviata, firewall sulla porta 9505.","Master password dimenticata: non è recuperabile per scelta di sicurezza.","Windows segnala l''app come non riconosciuta: è normale per un''app nuova, procedi con Esegui comunque.","Uso fuori casa: per progetto funziona solo nella rete locale del PC host."]}'::jsonb)
) as seed(position, type, content)
where not exists (select 1 from public.doc_blocks);

-- ----------------------------------------------------------------------------
-- 3) revoke_activation — l'utente scollega il device, revoca e rigenera il token
--    Sicurezza: opera SOLO sulle attivazioni dell'utente loggato (current_email()).
--    Rigenerare il token invalida quello precedente (anti-pirateria).
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

  update public.activations
     set hwid = null,
         status = 'pending',
         activated_at = null,
         activation_token = gen_random_uuid()
   where id = r.id
   returning * into r;

  return jsonb_build_object('ok', true, 'token', r.activation_token, 'status', r.status);
end;
$$;

grant execute on function public.revoke_activation(uuid) to authenticated;
