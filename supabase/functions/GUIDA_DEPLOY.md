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

## 2) Carica le funzioni di pagamento

```bash
npm run functions:deploy
```

Questo comando pubblica in un colpo solo: `create-checkout`, `simulate-payment`, `stripe-webhook`,
`paypal-webhook`. Da questo momento il **checkout funziona in modalità simulata** (nessun addebito
reale): puoi già provare l'acquisto di un piano dall'inizio alla fine.

## 3) (Facoltativo) Attiva i pagamenti veri Stripe/PayPal

1. Copia `supabase/functions/.env.example` in `supabase/functions/.env` e riempi le chiavi.
2. Carica i segreti:
   ```bash
   npm run functions:secrets
   ```
3. Configura i webhook su Stripe/PayPal verso:
   - `https://<PROJECT-REF>.functions.supabase.co/stripe-webhook`
   - `https://<PROJECT-REF>.functions.supabase.co/paypal-webhook`

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
