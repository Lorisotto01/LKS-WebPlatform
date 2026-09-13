-- ============================================================================
-- 0008_watchtower_feature.sql — WatchTower nella matrice dei piani
-- (task 869f0tcka, v4.9.0).
--
-- Va applicata SOPRA un database che ha gia' eseguito 0001-0007. Tocca una sola
-- riga di public.plan_features: nessuno schema cambia, nessun dato utente viene
-- letto o modificato. Idempotente (upsert sulla chiave).
--
-- COSA SBLOCCA. WatchTower e' la dashboard di sicurezza dell'account nella Web
-- App LAN: punteggio da 1 a 1000, password deboli / riutilizzate / vecchie / in
-- scadenza, e la verifica facoltativa delle violazioni note. Gli endpoint del
-- report sono gated a ESSENTIAL nella DesktopApp (PlanCatalog.RULES): questa riga
-- e' la stessa decisione dal lato commerciale, ed e' quella che alimenta le
-- targhette ESSENTIAL/PRO e il confronto piani sul sito.
--
-- ATTENZIONE ALL'ALLINEAMENTO. La chiave 'watchtower' compare in tre punti che
-- vanno tenuti d'accordo fra loro:
--   * DesktopApp  -> PlanCatalog.RULES        (gating autorevole dell'API)
--   * WebApp      -> utils/plans.ts           (targhette lato client)
--   * WebPlatform -> src/lib/plans.ts + qui   (pagina /pricing e confronto piani)
-- Cambiare min_plan qui senza cambiarlo in PlanCatalog produce un sito che
-- promette una funzionalita' che l'app poi rifiuta con un 402.
--
-- La preferenza del breach check NON e' una funzionalita' a pagamento: resta
-- libera anche nel piano Free, perche' e' una scelta di privacy dell'utente e
-- non deve dipendere da quanto paga.
-- ============================================================================

insert into public.plan_features (feature_key, label, description, category, min_plan, sort_order)
values
  ('watchtower', 'WatchTower',
   'Punteggio di sicurezza del vault: password deboli, riutilizzate, vecchie, in scadenza e violazioni note',
   'password', 'essential', 35)
on conflict (feature_key) do update set
  label       = excluded.label,
  description = excluded.description,
  category    = excluded.category,
  min_plan    = excluded.min_plan,
  sort_order  = excluded.sort_order;

do $$
declare
  v_min text;
begin
  select min_plan into v_min from public.plan_features where feature_key = 'watchtower';
  raise notice 'WatchTower -> piano minimo: %', v_min;
end $$;
