# Activation API — contratto per DesktopApp e Tool-CLI

Implementazione lato WebPlatform della modifica "Lock/Unlock — binding HWID + flag stato" (LKS v4.0.6).

Gli "endpoint" sono **funzioni RPC Supabase** (PostgREST), non un server custom. Si chiamano in HTTP `POST` come una normale REST API.

## Base

- Base URL: `https://<project>.supabase.co/rest/v1/rpc/<funzione>`
- Header obbligatori:
  - `apikey: <SUPABASE_ANON_KEY>` (la publishable/anon, pubblica)
  - `Authorization: Bearer <SUPABASE_ANON_KEY>`
  - `Content-Type: application/json`
- I nomi dei parametri nel body sono **prefissati con `p_`** (convenzione PostgREST per gli argomenti di funzione).

## Stati attivazione

`pending` → (binding HWID) → `active` → (eventuale) `suspended`.

Il `activation_token` (UUID) viene generato dalla WebPlatform al download e mostrato all'utente nella dashboard (sezione "Attivazione dispositivo").

---

## 1) Binding HWID — `bind_activation`

Chiamata dalla **DesktopApp al primo avvio**. Collega l'HWID locale al token inserito dall'utente.

`POST /rest/v1/rpc/bind_activation`

```json
{
  "p_token": "f3c1...-uuid",
  "p_email": "mario.rossi@gmail.com",
  "p_hwid": "HWID-CALCOLATO-DALLA-APP",
  "p_app_version": "v1.2.0"
}
```

Risposte (idempotente: rich. ripetuta con lo stesso HWID = stesso esito):

```jsonc
// primo binding o stesso dispositivo
{ "ok": true, "status": "active", "email": "...", "token": "...", "hwid": "...", "activatedAt": "2026-06-15T..." }

// token inesistente o email non coerente
{ "ok": false, "error": "token_not_found" }

// token sospeso
{ "ok": false, "error": "suspended", "status": "suspended" }

// stesso token, dispositivo diverso  → RIFIUTATO
{ "ok": false, "error": "hwid_mismatch", "status": "active" }
```

Policy collisione HWID: **rifiuto**. Il re-bind su un nuovo dispositivo si fa solo lato admin azzerando l'HWID (vedi Ops).

---

## 2) Validazione licenza — `validate_license` (STUB, future-ready)

Pronta ma **non ancora obbligatoria** nel flusso di sblocco (la validazione resta manuale via Tool-CLI). Il Tool-CLI la userà con `--validate`.

`POST /rest/v1/rpc/validate_license`

```json
{
  "p_token": "f3c1...-uuid",
  "p_email": "mario.rossi@gmail.com",
  "p_hwid": "HWID-CALCOLATO-DALLA-APP"
}
```

Risposta:

```jsonc
{ "active": true,  "status": "active",    "email": "...", "token": "...", "hwid": "..." }
{ "active": false, "status": "suspended", "email": "...", "token": "...", "hwid": "..." }
{ "active": false, "status": "unknown",   "email": "...", "token": "...", "hwid": "..." } // record non trovato
```

Regola: `active = (record esiste && hwid combacia && status === 'active')`.

---

## Esempi

cURL:

```bash
curl -X POST "https://<project>.supabase.co/rest/v1/rpc/bind_activation" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_token":"...","p_email":"mario@x.it","p_hwid":"ABC","p_app_version":"v1.2.0"}'
```

Java (DesktopApp, HttpClient):

```java
var body = """
  {"p_token":"%s","p_email":"%s","p_hwid":"%s","p_app_version":"%s"}
  """.formatted(token, email, hwid, appVersion);
var req = HttpRequest.newBuilder()
    .uri(URI.create(supabaseUrl + "/rest/v1/rpc/bind_activation"))
    .header("apikey", anonKey)
    .header("Authorization", "Bearer " + anonKey)
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
```

---

## Ops (admin / SQL)

```sql
-- sospendere / riattivare
update public.activations set status = 'suspended' where email = '...';
update public.activations set status = 'active'    where email = '...';

-- re-bind su nuovo dispositivo (poi la DesktopApp ribinda al primo avvio)
update public.activations set hwid = null, status = 'pending' where activation_token = '...';
```

## Anti-regressione

- L'HWID arriva **solo** dalla DesktopApp via `bind_activation`, mai dal browser.
- `status` è un semplice flag, non un sistema di billing (sez. 17 fuori scope).
- I campi `activation_token` e `hwid` devono restare allineati tra DesktopApp (binding) e Tool-CLI (echo nell'unlock).
