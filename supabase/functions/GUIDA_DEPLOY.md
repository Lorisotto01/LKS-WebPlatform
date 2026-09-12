# Guida rapida — Deploy database + funzioni pagamenti (senza installare nulla a mano)

Non serve creare niente a mano: i file esistono già nel repo. Ti serve solo **caricarli su Supabase**.
Tutti i comandi si lanciano dalla cartella **`Web Platform`**. La CLI Supabase è già inclusa come
dipendenza del progetto: dopo `npm install` funziona tramite gli script `npm run ...` (non serve il
comando globale `supabase`, per questo il tuo PC non lo trovava).

## 0) Una volta sola

```bash
npm install            # installa anche la CLI Supabase (dev dependency)
npm run sb:login       # apre il browser per autenticarti su Supabase
npm run sb:link        # collega la cartella al tuo progetto (ti chiede il project-ref)
```

> Il **project-ref** è l'ID del progetto: lo trovi nell'URL della dashboard
> `https://supabase.com/dashboard/project/<PROJECT-REF>` oppure in Project Settings → General.

## 1) Applica le migration del database (tabelle piani, ordini, sconti…)

**Opzione A — da terminale:**
```bash
npm run db:push        # applica tutte le migration in supabase/migrations
```

**Opzione B — senza CLI, dalla dashboard (più semplice se A dà problemi):**
Apri **Supabase → SQL Editor → New query**, poi copia e incolla il contenuto di questi file e premi Run,
uno alla volta e in ordine:
- `supabase/migrations/0015_v440_plans.sql`
- `supabase/migrations/0016_v440_checkout.sql`
- `supabase/migrations/0017_v442_subscription_expiry.sql`
- `supabase/migrations/0018_v450_recurring_unlocks.sql`
- `supabase/migrations/0019_v460_lock_events.sql`  ⬅️ crea `lock_events` + RPC `report_lock`/`active_lock_type`/`resolve_locks`
- `supabase/migrations/0020_v461_report_lock_text_ts.sql`  ⬅️ robustezza di `report_lock` (obbligatoria)

> ⚠️ **Importante:** senza 0019 + 0020 la DesktopApp non riesce a scrivere i blocchi: gli eventi
> restano in `cfg/lock_queue.json` sul PC e la RPC `report_lock` risponde **404** (funzione non
> trovata), quindi in `lock_events` non compare nulla. Applicando le due migration, alla successiva
> apertura dell'app la coda locale viene ri-sincronizzata automaticamente.

## 2) Carica le funzioni di pagamento

```bash
npm run functions:deploy
```

Questo comando pubblica in un colpo solo: `create-checkout`, `simulate-payment`, `stripe-webhook`,
`paypal-webhook`, `send-unlock-email` e `device-unlock`. Da questo momento il **checkout funziona in
modalità simulata** (nessun addebito reale): puoi già provare l'acquisto di un piano dall'inizio alla
fine.

> `device-unlock` viene pubblicata con `--no-verify-jwt` perché è chiamata dalla DesktopApp con la
> chiave pubblica (l'autenticazione del dispositivo — `hwid` + `activation_token` — avviene dentro la
> function). È ciò che permette alla DesktopApp di **scaricare e verificare in automatico** l'unlock
> caricato dall'admin.

## 3) (Facoltativo) Attiva i pagamenti veri Stripe/PayPal

1. Copia `supabase/functions/.env.example` in `supabase/functions/.env` e riempi le chiavi.
2. Carica i segreti:
   ```bash
   npm run functions:secrets
   ```
   > **`PUBLIC_SITE_URL` non passa da qui.** Il comando carica solo ciò che sta in
   > `supabase/functions/.env`. `PUBLIC_SITE_URL` va impostata a parte e serve sia per i
   > `success_url`/`cancel_url` del checkout sia, da v4.8.2, per l'origine ammessa dal CORS:
   > ```bash
   > supabase secrets set PUBLIC_SITE_URL=https://securelocalshare.netlify.app
   > ```
   > Se chiami le function anche da un dominio diverso da quello di produzione, elencalo in
   > `ALLOWED_ORIGINS` (separato da virgole). Deploy preview Netlify, localhost e indirizzi di
   > rete privata sono già ammessi senza configurazione — vedi `_shared/cors.ts`.
3. Configura i webhook su Stripe/PayPal verso:
   - Stripe → `https://<PROJECT-REF>.functions.supabase.co/stripe-webhook`
     eventi: **checkout.session.completed**, **invoice.paid**, **customer.subscription.deleted**
   - PayPal → `https://<PROJECT-REF>.functions.supabase.co/paypal-webhook`
     eventi: **PAYMENT.CAPTURE.COMPLETED**, **CHECKOUT.ORDER.APPROVED**
   - (Opzionale) Email sblocchi: imposta `RESEND_API_KEY` e `RESEND_FROM` nei secret.

I dettagli (dove prendere le chiavi, quali eventi ascoltare, carta di test) sono nel documento
`Documentazione/Setup_Pagamenti_SecureLocalShare.docx`.

## Sviluppo in locale (facoltativo)

```bash
npm run functions:serve   # esegue le funzioni sul tuo PC per fare test
```

## Riepilogo comandi

| Comando | Cosa fa |
|---------|---------|
| `npm run sb:login` | Autenticazione Supabase |
| `npm run sb:link` | Collega il progetto |
| `npm run db:push` | Applica le migration del DB |
| `npm run functions:deploy` | Pubblica le 4 funzioni |
| `npm run functions:secrets` | Carica le chiavi Stripe/PayPal |
| `npm run functions:serve` | Esegue le funzioni in locale |
