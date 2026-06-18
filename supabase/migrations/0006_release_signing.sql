-- ============================================================================
-- C1 — Release firmate: hash SHA-256 + firma Ed25519 detached.
--
-- Obiettivo: la DesktopApp, dopo aver scaricato il .exe, deve poter verificare
-- (a) integrità del binario tramite SHA-256 e (b) autenticità tramite firma
-- Ed25519 prodotta OFFLINE dal Tool-CLI (la chiave privata non sta mai nel
-- browser). Senza queste colonne il desktop non può verificare nulla.
--
-- Migrazione NON distruttiva: aggiunge solo colonne nullable. Le release
-- storiche restano valide finché non vengono ribackfillate o ripubblicate
-- firmate. La validazione "no hash/firma => no is_active" è applicata lato UI
-- (vedi AdminReleases.tsx) finché tutte le release storiche non sono firmate.
-- ============================================================================

alter table public.releases
  add column if not exists sha256      text,           -- hex lowercase, 64 char
  add column if not exists signature   text,           -- Ed25519 detached, base64
  add column if not exists sign_key_id text;           -- id/fingerprint chiave pubblica

-- Le policy RLS esistenti coprono già le nuove colonne:
--   releases_admin_write          (admin: insert/update/delete)
--   releases_select_anon_active   (anon: SELECT solo release attive)
--   releases_select_all           (authenticated: SELECT)
-- Le colonne sono quindi esposte ad anon SOLO per le release attive, esattamente
-- ciò che serve alla verifica desktop.

-- ----------------------------------------------------------------------------
-- Hardening opzionale (eseguire SOLO dopo aver backfillato/ripubblicato tutte
-- le release storiche con sha256 + signature valorizzati):
--
--   alter table public.releases alter column sha256    set not null;
--   alter table public.releases alter column signature set not null;
-- ----------------------------------------------------------------------------
