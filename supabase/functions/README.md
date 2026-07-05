# Supabase Edge Functions — Checkout & Pagamenti (v4.4.0)

Backend serverless del flusso di pagamento. Il prezzo è calcolato **sempre lato
server** (mai fidarsi del client) leggendo `plans` + sconti attivi.

## Functions

| Function | Scopo | Auth |
|----------|-------|------|
| `create-checkout` | Crea l'ordine e avvia il pagamento (Stripe/PayPal) o restituisce il link alla pagina simulata | JWT utente |
| `simulate-payment` | Finalizza un ordine in modalità simulata (senza provider reale) | JWT utente |
| `stripe-webhook` | Finalizza l'ordine su `checkout.session.completed` | Firma Stripe |
| `paypal-webhook` | Finalizza l'ordine su capture PayPal | (Webhook PayPal) |

## Variabili d'ambiente (Project Settings → Edge Functions → Secrets)

```
SUPABASE_URL=...                 # iniettata da Supabase
SUPABASE_ANON_KEY=...            # iniettata da Supabase
SUPABASE_SERVICE_ROLE_KEY=...    # iniettata da Supabase
PUBLIC_SITE_URL=https://securelocalshare.netlify.app

# Stripe (opzionali: se assenti si usa la modalità SIMULATA)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal (opzionali)
PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
```

> Se le chiavi Stripe/PayPal non sono configurate, `create-checkout` restituisce
> un link a `/checkout/simulate` e il pagamento viene finalizzato da
> `simulate-payment`. Basta aggiungere le chiavi per attivare i provider reali,
> senza modifiche al codice.

## Deploy

```bash
supabase functions deploy create-checkout
supabase functions deploy simulate-payment
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy paypal-webhook --no-verify-jwt
```

Configura poi gli endpoint webhook su Stripe/PayPal verso le URL delle function.
