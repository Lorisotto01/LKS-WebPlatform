-- ============================================================================
-- 0014_v437_docs_custom_fields.sql
--
-- v4.3.7 — Documentazione: campi personalizzati nelle categorie credenziali.
-- Aggiunge alla pagina /docs (CMS doc_blocks) una nuova sezione che spiega come
-- definire campi personalizzati nelle categorie di tipo Credenziali e il
-- comportamento dei campi "Data scadenza" (avvisi, banner, filtro, scadute).
--
-- Idempotente: i blocchi vengono inseriti solo se la sezione non è già presente,
-- così non sovrascrive eventuali modifiche fatte dall'editor CMS.
-- ============================================================================

insert into public.doc_blocks (position, type, content)
select * from (values
  (240::float8, 'title', '{"text":"11. Campi personalizzati nelle categorie","icon":"KeyRound"}'::jsonb),
  (250, 'paragraph', '{"text":"Quando crei o modifichi una **categoria di tipo Credenziali** puoi definire fino a **4 campi personalizzati** (anche dello stesso tipo, es. quattro campi numerici). Ogni credenziale assegnata a quella categoria mostrerà automaticamente quei campi nel form e nella scheda di dettaglio."}'::jsonb),
  (260, 'list', '{"ordered":false,"items":["**Testuale** — testo libero con un numero massimo di caratteri (predefinito 30).","**Numerico** — un valore numerico.","**Data scadenza** — una data che attiva avvisi e banner di scadenza.","**Secret** — un valore riservato, cifrato come la password; puoi indicare se è **condivisibile** quando condividi la credenziale."]}'::jsonb),
  (270, 'note', '{"text":"Campi Data scadenza: quando la scadenza è vicina ricevi una **notifica entro 10 giorni** e sulla scheda compare in alto a destra un banner con l''icona di allerta — **rosso da 0 a 10 giorni**, **giallo da 11 a 30 giorni**. Il filtro **In scadenza** mostra tutte le credenziali entro 30 giorni. Quando la credenziale è scaduta il banner lascia il posto a una **mini-scheda rossa «Credenziale scaduta»**, ben visibile scorrendo l''elenco."}'::jsonb)
) as seed(position, type, content)
where not exists (
  select 1 from public.doc_blocks
  where content->>'text' = '11. Campi personalizzati nelle categorie'
);
