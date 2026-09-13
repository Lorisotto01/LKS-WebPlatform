-- ============================================================================
-- 03_seed_content.sql — Genera i contenuti editoriali del sito.
--
-- Popola:
--   * public.doc_settings   -> titolo e sottotitolo della pagina /docs
--   * public.doc_blocks     -> la guida completa di /docs (12 sezioni)
--   * public.author_profile -> la pagina /chi-sono
--
-- ----------------------------------------------------------------------------
-- ATTENZIONE: questo script SOVRASCRIVE i contenuti esistenti.
--
-- doc_blocks viene svuotata e ricostruita: ogni modifica fatta dal pannello
-- /admin/docs-manager va persa. E' voluto — serve a riportare la guida allo
-- stato canonico dopo un azzeramento, o quando l'editor e' stato pasticciato.
-- Se hai personalizzato la documentazione e vuoi tenerla, NON eseguirlo.
--
-- author_profile e doc_settings vengono aggiornati solo nei campi editoriali;
-- la foto profilo (photo_url) viene preservata se gia' presente, perche' vive
-- nel bucket assets e non e' un contenuto testuale.
--
-- PREREQUISITO: le migration 0001..0006 devono essere gia' applicate.
-- Rieseguibile: il risultato e' sempre lo stesso.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 0. CONTROLLO PREREQUISITI
-- ============================================================================
do $seed$
begin
  if to_regclass('public.doc_blocks') is null
     or to_regclass('public.doc_settings') is null
     or to_regclass('public.author_profile') is null then
    raise exception using
      errcode = 'P0002',
      message = 'Tabelle dei contenuti mancanti.',
      hint    = 'Applica prima le migration 0001..0006, poi riesegui questo script.';
  end if;
end
$seed$;

-- ============================================================================
-- 1. IMPOSTAZIONI DELLA PAGINA /docs
-- ============================================================================
insert into public.doc_settings (id, page_title, page_subtitle, show_index, show_numbering)
values (
  1,
  'Guida a SecureLocalShare',
  'Come installare e usare SecureLocalShare: il tuo password manager che vive sulla tua rete di casa, senza cloud e senza abbonamenti.',
  true,
  true
)
on conflict (id) do update set
  page_title     = excluded.page_title,
  page_subtitle  = excluded.page_subtitle,
  show_index     = excluded.show_index,
  show_numbering = excluded.show_numbering,
  updated_at     = now();

-- ============================================================================
-- 2. CONTENUTO DELLA GUIDA /docs
-- ============================================================================
-- Svuota e ricostruisce: `position` e' spaziata di 10 per poter inserire nuovi
-- blocchi in mezzo dall'editor senza rinumerare nulla.
delete from public.doc_blocks;

insert into public.doc_blocks (position, type, content) values
  (10,  'title',     '{"text":"1. Cos''è e come funziona","icon":"ShieldCheck"}'::jsonb),
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
  (130, 'list',      '{"ordered":false,"items":["Password: salva credenziali in categorie, copia, mostra/nascondi, modifica.","Condivisione cifrata tra utenti della stessa rete.","LocalDrop: file e note ritrovabili da ogni dispositivo.","Notifiche quando qualcuno condivide qualcosa con te.","WatchTower: il punteggio di sicurezza del tuo vault (piano Essential)."]}'::jsonb),

  (140, 'title',     '{"text":"7. Il collegamento tra Web App e Desktop","icon":"Wifi"}'::jsonb),
  (150, 'paragraph', '{"text":"La Web App e l''app Desktop parlano tra loro **solo sulla rete locale**. Il browser e il server condividono la stessa origine, quindi nessun dato passa da server esterni e le richieste da fuori rete vengono rifiutate."}'::jsonb),

  (160, 'title',     '{"text":"8. Sicurezza e privacy","icon":"Lock"}'::jsonb),
  (170, 'list',      '{"ordered":false,"items":["I vault sono cifrati con AES-256-GCM: in chiaro non finisce nulla su disco.","La master password protegge tutto e non è recuperabile.","Nessun cloud, nessun server di terze parti vede le tue credenziali.","L''identificativo del dispositivo serve solo a legare la licenza al PC host."]}'::jsonb),

  (180, 'title',     '{"text":"9. Aggiornamenti, blocco e attivazione","icon":"RefreshCw"}'::jsonb),
  (190, 'paragraph', '{"text":"L''app controlla da sé le nuove versioni e ti guida nell''installarle. Ogni PC host va attivato una volta col codice della dashboard. In caso di manomissioni o troppi tentativi falliti l''app può bloccarsi: esistono due tipi di blocco."}'::jsonb),
  (200, 'warning',   '{"text":"ENV_LOCK (manomissione di environment.lks): il proprietario ripristina con la master password — che per sicurezza azzera le credenziali — oppure applicando un unlock.lks firmato dall''autore."}'::jsonb),
  (210, 'warning',   '{"text":"PERMANENT_LOCK (10 tentativi falliti): sblocco solo con un unlock.lks firmato dall''autore, verificato per firma, hardware ID e scadenza."}'::jsonb),

  (220, 'title',     '{"text":"10. Problemi comuni (FAQ)","icon":"HelpCircle"}'::jsonb),
  (230, 'list',      '{"ordered":false,"items":["Web App irraggiungibile dal telefono: stessa rete, app avviata, firewall sulla porta 9505.","Master password dimenticata: non è recuperabile per scelta di sicurezza.","Windows segnala l''app come non riconosciuta: è normale per un''app nuova, procedi con Esegui comunque.","Uso fuori casa: per progetto funziona solo nella rete locale del PC host."]}'::jsonb),

  (240, 'title',     '{"text":"11. Campi personalizzati nelle categorie","icon":"KeyRound"}'::jsonb),
  (250, 'paragraph', '{"text":"Quando crei o modifichi una **categoria di tipo Credenziali** puoi definire fino a **4 campi personalizzati** (anche dello stesso tipo, es. quattro campi numerici). Ogni credenziale assegnata a quella categoria mostrerà automaticamente quei campi nel form e nella scheda di dettaglio."}'::jsonb),
  (260, 'list',      '{"ordered":false,"items":["**Testuale** — testo libero con un numero massimo di caratteri (predefinito 30).","**Numerico** — un valore numerico.","**Data scadenza** — una data che attiva avvisi e banner di scadenza.","**Secret** — un valore riservato, cifrato come la password; puoi indicare se è **condivisibile** quando condividi la credenziale."]}'::jsonb),
  (270, 'note',      '{"text":"Campi Data scadenza: quando la scadenza è vicina ricevi una **notifica entro 10 giorni** e sulla scheda compare in alto a destra un banner con l''icona di allerta — **rosso da 0 a 10 giorni**, **giallo da 11 a 30 giorni**. Il filtro **In scadenza** mostra tutte le credenziali entro 30 giorni. Quando la credenziale è scaduta il banner lascia il posto a una **mini-scheda rossa «Credenziale scaduta»**, ben visibile scorrendo l''elenco."}'::jsonb),

  (280, 'title',     '{"text":"12. WatchTower: il punteggio di sicurezza","icon":"ShieldCheck"}'::jsonb),
  (290, 'paragraph', '{"text":"Nella Web App la voce **WatchTower** analizza le credenziali di cui sei proprietario e le riassume in un **punteggio da 1 a 1000**, con l''elenco esatto di quelle su cui intervenire. Il calcolo avviene **interamente sul PC host**: le password non escono mai dalla tua rete, e quello che il browser riceve sono solo verdetti e conteggi. WatchTower fa parte del piano **Essential**."}'::jsonb),
  (300, 'list',      '{"ordered":false,"items":["**Deboli** — troppo corte o troppo prevedibili; il costo sul punteggio cresce mano a mano che la password è più debole.","**Riutilizzate** — la stessa password su più account: chi ne viola uno li apre tutti.","**Vecchie** — non cambiate da oltre un anno. Una credenziale salvata prima dell''arrivo di WatchTower non ha una data nota e non viene mai segnalata come vecchia.","**In scadenza** — riusa i campi Data scadenza delle categorie.","**Sito non sicuro** — l''indirizzo è in http:// invece che https://.","**Compromesse** — la password compare in archivi pubblici di credenziali violate (controllo facoltativo, vedi sotto)."]}'::jsonb),
  (310, 'paragraph', '{"text":"Il punteggio è la media della salute delle singole credenziali, con dei **tetti massimi** per i casi gravi: finché esiste una password compromessa non si supera 400, con una password critica non si supera 650. Serve a evitare che novanta credenziali sane nascondano l''unica che va cambiata oggi. Il motivo del tetto è sempre scritto accanto al punteggio. Se una segnalazione non ti interessa puoi **ignorarla**: esce dalla lista e smette di pesare, ma resta contata e ripristinabile quando vuoi."}'::jsonb),
  (320, 'note',      '{"text":"**Verifica delle violazioni note — spenta di default.** È l''unica funzione dell''app che apre una connessione verso l''esterno oltre all''aggiornamento automatico, quindi si attiva solo se sei tu a volerlo, dalle Impostazioni, e la scelta vale soltanto per il tuo account. Anche quando è attiva la password **non viene inviata**: si spediscono i primi 5 caratteri dell''impronta crittografica e il confronto si chiude sul tuo PC. Se la rete non risponde la categoria resta **non verificata** — non diventa mai un rassicurante zero."}'::jsonb);


-- ============================================================================
-- 3. PAGINA /chi-sono
-- ============================================================================
-- `bio`: ogni a capo diventa un paragrafo (ChiSono.tsx fa split su "\n").
-- `contacts`: array di {label, value, href} — href e' opzionale.
-- La foto (photo_url) NON viene toccata: si carica dal pannello admin.
insert into public.author_profile
  (id, display_name, headline, bio, email, location, contacts)
values (
  1,
  'Lorenzo Sottocorno',
  'Sviluppatore e autore di SecureLocalShare',
  'Sviluppo software con una convinzione precisa: i dati personali stanno meglio a casa propria che sul server di qualcun altro.' || chr(10) ||
  'SecureLocalShare nasce da qui. È un gestore di password e file che vive interamente sulla tua rete locale: nessun cloud, nessun abbonamento obbligatorio, nessun terzo che possa leggere quello che custodisci. Il vault è cifrato sul tuo dispositivo e non lo lascia mai in chiaro.' || chr(10) ||
  'Il progetto comprende l''app Desktop che fa da server sulla rete di casa, la Web App per gli altri dispositivi e questa piattaforma per licenze, aggiornamenti e assistenza. Lo curo in ogni parte, dal codice alla documentazione che stai leggendo.' || chr(10) ||
  'Se hai trovato un problema o hai un''idea per una funzionalità, la segnalazione dall''app arriva direttamente a me.',
  'lorisotto2001@gmail.com',
  'Italia',
  '[]'::jsonb
)
on conflict (id) do update set
  display_name = excluded.display_name,
  headline     = excluded.headline,
  bio          = excluded.bio,
  email        = excluded.email,
  location     = excluded.location,
  contacts     = excluded.contacts,
  -- preserva la foto gia' caricata, se c'e'
  photo_url    = coalesce(public.author_profile.photo_url, excluded.photo_url),
  updated_at   = now();

-- ============================================================================
-- 4. RIEPILOGO
-- ============================================================================
do $seed$
declare v_blocks integer; v_title text; v_name text;
begin
  select count(*) into v_blocks from public.doc_blocks;
  select page_title into v_title from public.doc_settings where id = 1;
  select display_name into v_name from public.author_profile where id = 1;

  raise notice 'Contenuti generati:';
  raise notice '  /docs      -> "%" con % blocchi', v_title, v_blocks;
  raise notice '  /chi-sono  -> profilo di %', v_name;
  raise notice 'Da qui in poi si modifica tutto da /admin/docs-manager.';
end
$seed$;

-- ============================================================================
-- Fine 03_seed_content.sql
-- ============================================================================
