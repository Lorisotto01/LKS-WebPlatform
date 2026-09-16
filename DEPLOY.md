# SecureLocalShare — Platform Web (Fase 5)

Sito pubblico di distribuzione: React 18 + TS + Vite + Tailwind, backend **Supabase**,
deploy su **Netlify**. Supabase è la fonte di verità degli utenti (`registrations`).

## 1. Setup Supabase

1. Crea un progetto su https://supabase.com.
2. **SQL Editor** → esegui `supabase/migrations/0001_init.sql` (tabelle, RLS, bucket
   privato `releases`). Opzionale: `0002_seed_example.sql` per una release di esempio.
3. **Authentication → Providers → Email**: abilita *Confirm email* (verifica obbligatoria).
4. **Authentication → URL Configuration**: aggiungi il dominio Netlify e
   `https://<sito>/verify-email` tra i *Redirect URLs*.
5. **Storage → bucket `releases`** (già creato dalla migration, privato): carica i file
   `.exe`. Il campo `releases.download_url` deve corrispondere al *path* dell'oggetto nel
   bucket (es. `SecureLocalShareSetup-1.0.0.exe`).

## 2. Variabili d'ambiente

Solo chiave **pubblica** — la `service_role`/secret NON entra mai nel web (è riservata al
Tool CLI della Fase 6). Sui progetti recenti la chiave pubblica si chiama **publishable key**
(`sb_publishable_...`), che sostituisce la vecchia *anon key*; sono equivalenti e
intercambiabili con `supabase-js`. La trovi in *Project Settings → API Keys*.

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# legacy, in alternativa: VITE_SUPABASE_ANON_KEY=<anon public key>
```

In locale: copia `.env.example` → `.env`. Su Netlify: *Site settings → Environment variables*.

## 3. Sviluppo / build

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/  (verificato: tsc 0 errori, 1633 moduli)
```

## 4. Deploy Netlify

`netlify.toml` è già configurato (`build = npm run build`, `publish = dist`, SPA fallback).
Collega il repo, imposta le due env var, deploy.

## 5. Pubblicare una voce di changelog (task 869f34rxx)

La pagina `/changelog` carica a runtime `public/CHANGELOG.md` (`fetch('/CHANGELOG.md')`,
vedi `src/pages/Changelog.tsx`): è un **file statico incluso nel build di Netlify**, non un
contenuto letto dal database. `scripts/sync-changelog.mjs` (eseguito da `predev`/`prebuild`) lo
copia da `../CHANGELOG.md`, cioè il changelog dell'app principale — un percorso che esiste solo
in locale, perché questo repo (`LKS-WebPlatform`, deploy Netlify) è **separato** da quello
dell'app desktop dove il changelog viene scritto.

Per questo aggiungere una voce al changelog dell'app **non aggiorna da solo il sito**: Netlify
builda solo `LKS-WebPlatform`, e in quell'ambiente `../CHANGELOG.md` non esiste (lo script lo
nota e salta la copia in silenzio, lasciando `public/CHANGELOG.md` fermo a com'era nell'ultimo
commit). Il sito riflette una nuova voce solo dopo, in locale:

```bash
npm run sync:changelog   # o build/dev, che lo eseguono da soli
git add public/CHANGELOG.md
git commit -m "changelog: sync vX.Y.Z"
git push                 # Netlify fa auto-deploy sul push
```

Sì: **serve un deploy** (in pratica un push su questo repo) perché la nuova voce raggiunga
`secureLocalShare.<dominio>/changelog` — non basta salvare `CHANGELOG.md` nel repo dell'app.

## Flusso (DoD Fase 5)

Home → Register (`signUp` + riga `registrations`) → email di verifica → Login →
Dashboard: lista `releases` con `is_active = true`, **download via URL firmato (10 min)**
con `createSignedUrl`, inserimento in `downloads` e aggiornamento `last_download_at`.

## RLS (riassunto)

| Tabella | Lettura | Scrittura |
|---|---|---|
| registrations | solo proprietario (email loggata) | insert self (web) · update solo `service_role` (CLI) |
| downloads | solo proprietario | insert self (web) |
| releases | tutti gli autenticati | solo `service_role` (CLI) |

Il bucket `releases` è privato: gli utenti autenticati possono solo generare URL firmati,
mai accedere a un link pubblico fisso.
