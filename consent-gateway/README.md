# consent-gateway

"Me as an API." A person stores their own data once (sizes, allergies, addresses, preferences...) in a vault.
Third-party apps register as **clients** and ask for **scoped, purposeful, time-limited, revocable** access. The owner
approves (optionally narrowing), the gateway issues **short-lived signed access tokens** and serves **only the approved
attributes**. Every access, allowed or denied, lands in a **tamper-evident audit log**. It is OAuth plus policy
engineering, as a product. Port **8084**, Postgres schema **`consent`**.

## Architecture

```
 Owner (Firebase ID token)                     Third-party app (client id + secret)
        |                                                   |
        |  /v1/owner/**                                     |  /v1/oauth/token  (Basic or form creds)
        v                                                   v
 +----------------+                                +------------------+
 | chain 3:       |                                | chain 2: public  |  /v1/oauth/**, /.well-known/jwks.json
 | Firebase JWT   |                                | (client auth in  |
 +-------+--------+                                |  controller)     |
         |                                         +--------+---------+
         |                                                  | client token (RS256, token_use=client)
         |                                                  v
         |                                         +------------------+  /v1/gateway/requests, /grants/{id}/token
         |                                         | chain 1 (first): |  needs authority TOKEN_CLIENT
         |                                         | OWN gateway JWTs |  /v1/gateway/data -> TOKEN_ACCESS
         |                                         +--------+---------+
         v                                                  v
 +---------------------------------------------------------------------------+
 | VaultService  ClientService  ConsentService  GatewayDataService           |
 |        \             |             |                /     \               |
 |         \            |             |        PolicyEngine   TokenService   |
 |          \           |             |        (pure)         SigningKeyService (JWKS, rotation)
 |           +----------+-------------+--- AuditService (hash chain, MANDATORY tx) ---+
 +----------------------------------------+------------------------------------------+
                                          v
                         Postgres schema `consent` (jOOQ)  +  consent_ext (append-only trigger)
```

The flow:

1. Owner registers a client (`POST /v1/owner/clients`) and receives `clientId` + `clientSecret` **once**.
2. Client gets a *client token* (`POST /v1/oauth/token`, `client_credentials`), then creates an access request
   (scopes, purpose, duration, optional `maxReads`, optional allowed hours).
3. Owner lists pending requests, then approves (narrowing scopes/duration/reads, setting a sensitivity ceiling) or denies.
4. Client polls its request, gets a `grantId`, exchanges it for a short-lived *access token*
   (`POST /v1/gateway/grants/{id}/token`). The token never outlives the grant.
5. Client reads `GET /v1/gateway/data[?path=...]`. On **every** read the gateway row-locks the live grant, runs the
   policy engine, releases only covered attributes, counts the read and appends an audit entry, in one transaction.
6. Owner can revoke a grant any time (`POST /v1/owner/grants/{id}/revoke`): the next read is denied, even though the
   token is still cryptographically valid.

## The heavy-tech pieces, and why they are justified

**1. Token issuer with JWKS, `kid` and rotation.** Access tokens are RS256 JWTs (Nimbus JOSE) with header
`typ: at+jwt` and a `kid`. The public **JWKS** (`/.well-known/jwks.json`) lets any relying party verify tokens offline,
so the gateway is not on the hot path for verification. Keys rotate: the old key is retired but stays in the JWKS until
every token it signed has expired (+ skew); new tokens use the new key. Why not HS256/opaque tokens: a shared secret
cannot be handed to third parties, and opaque tokens force a lookup on every call. The verifier pins RS256 and
`at+jwt`, so `alg: none`, HS256-with-public-key confusion and foreign signatures are rejected (all tested). A JWT alone
is *not* trusted: the converter also checks the gateway's record of the `jti` (revoked? client disabled?), and the data
service checks the live grant. Tokens are introspectable (`/v1/oauth/introspect`) and revocable (`/v1/oauth/revoke`).

**2. Policy engine** (`policy/PolicyEngine`, pure, no I/O, `now` passed in). A grant is
`{client, scopes, purpose, expires_at, max_reads, optional hours window, sensitivity ceiling}`. `evaluate()` returns
`ALLOW`/`DENY` with a machine-readable reason (`GRANT_REVOKED`, `GRANT_EXPIRED`, `MAX_READS_EXHAUSTED`,
`OUTSIDE_ALLOWED_HOURS`, `SCOPE_NOT_GRANTED`, ...). **Deny by default**: ALLOW is returned only after every check passes.
Scopes (`profile.sizes:read`) match on whole path *segments*: `profile.sizes` covers `profile.sizes.shoe` but never
`profile.sizes_secret` or `profile.sizesx`. Keeping it pure makes the security-critical rules table-testable (59 rows) and
reviewable in one file; the same engine is used for the request check and the per-attribute release filter.

**3. Hash-chained, append-only audit log.** One chain per owner: each entry stores `prev_hash` and
`entry_hash = SHA-256(length-prefixed fields)`. `GET /v1/owner/audit/verify` recomputes the chain and reports the
**first broken link** (`ENTRY_HASH_MISMATCH`, `PREV_HASH_MISMATCH`, `SEQUENCE_GAP`, or `HEAD_MISMATCH` for a cut tail;
the head table holds the latest position and hash). Appends are serialised by a row lock on the chain head and run in the
caller's transaction (`MANDATORY`), so an action and its audit record commit or roll back together. A Postgres trigger
(in the separate `consent_ext` migration location, invisible to the jOOQ generator) rejects UPDATE/DELETE/TRUNCATE on
`audit_log`. Why: the owner's whole trust in the product is "I can see who read what"; this makes silent edits
detectable. It stores no attribute values, only keys, decisions and reasons.

**Key storage.** Signing keys are generated on first start; the private half is stored AES-256-GCM encrypted
(random IV, key id as AAD, so a blob cannot be moved to another row) with a key from `CONSENT_KEY_ENCRYPTION_KEY`
(base64, 32 bytes). Startup fails without it; only the `dev` profile has an obviously-insecure default. Keys are never
logged (tested by capturing logs).

**Client secrets** are generated (256 bits), shown once, stored only as a Spring Security delegating hash (bcrypt),
verified in constant-ish time (dummy hash for unknown ids) and never logged or returned again.

## Endpoints

Owner API (Firebase ID token; owner = token subject, never a request field):

| Method | Path | Purpose |
|---|---|---|
| POST/GET | `/v1/owner/vault/attributes` | create / list (`?prefix=`) attributes |
| GET/PUT/DELETE | `/v1/owner/vault/attributes/{keyPath}` | read / replace / delete |
| POST/GET | `/v1/owner/clients` | register (secret returned once) / list |
| GET/DELETE | `/v1/owner/clients/{clientId}` | detail / disable (revokes all its grants and tokens) |
| POST | `/v1/owner/clients/{clientId}/rotate-secret` | new secret, old one stops working |
| GET | `/v1/owner/requests[?status=PENDING]`, `/{id}` | pending / past access requests |
| POST | `/v1/owner/requests/{id}/approve` | body optional: `scopes`, `durationSeconds`, `maxReads`, `maxSensitivity`, `allowedHours` (narrowing only) |
| POST | `/v1/owner/requests/{id}/deny` | optional `note` |
| GET | `/v1/owner/grants[?includeInactive=true]` | who has access to what |
| POST | `/v1/owner/grants/{id}/revoke` | instant, idempotent |
| GET | `/v1/owner/access-log?limit&beforeSeq&clientId` | access history, newest first |
| GET | `/v1/owner/audit/verify` | walk the chain, report the first broken link |
| GET | `/v1/owner/dashboard` | pending count, active grants, last 10 events |

Client / public API:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/oauth/token` | client id + secret (Basic or form) | `grant_type=client_credentials` -> client token |
| POST | `/v1/oauth/introspect` | client id + secret | RFC 7662, own tokens only |
| POST | `/v1/oauth/revoke` | client id + secret | RFC 7009, own tokens only |
| GET | `/.well-known/jwks.json` | none | public keys (active + still-verifiable retired keys) |
| POST | `/v1/gateway/requests` | client token | create an access request |
| GET | `/v1/gateway/requests/{id}` | client token | poll status / `grantId` |
| POST | `/v1/gateway/grants/{grantId}/token` | client token | exchange grant for access token |
| GET | `/v1/gateway/data[?path=&purpose=]` | access token | read approved attributes; denial = 403 ProblemDetail with `reason` |
| GET | `/actuator/health` | none | health |

Errors are RFC 9457 ProblemDetail with a stable `code`; token endpoints use RFC 6749 `{"error": ...}`.

## Running locally

```
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
./mvnw -pl consent-gateway -am verify          # builds sql-jooq + platform-security, runs all tests (Testcontainers Postgres 16)

# run the service (Postgres on :5433, see docker-compose.yml at the repo root)
export FIREBASE_PROJECT_ID=<your-firebase-project>
export SPRING_PROFILES_ACTIVE=dev              # ONLY for local dev: enables the public, insecure dev key-encryption key
./mvnw -pl consent-gateway spring-boot:run
```

Outside the `dev` profile you must provide a real key: `export CONSENT_KEY_ENCRYPTION_KEY=$(openssl rand -base64 32)`
(and keep it: without it the stored signing keys cannot be decrypted).

## Configuration

| Env var / property | Default | Meaning |
|---|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | local platform DB | Postgres |
| `FIREBASE_PROJECT_ID` | none (required) | owner API token audience/issuer |
| `CONSENT_KEY_ENCRYPTION_KEY` | none (required; dev profile has a public dev key) | base64 of 32 bytes, encrypts signing keys |
| `CONSENT_ISSUER` | `http://localhost:8084` | `iss` of gateway tokens, set to the public URL |
| `app.consent.audience` | `consent-gateway` | `aud` of gateway tokens |
| `app.consent.access-token-ttl` / `client-token-ttl` | `PT5M` | token lifetimes |
| `app.consent.clock-skew` | `PT30S` | tolerated skew; tokens stay valid this long past `exp` |
| `app.consent.request-ttl` | `P7D` | a pending request older than this cannot be approved |
| `app.consent.max-grant-duration` | `P365D` | upper bound on requested duration |
| `app.consent.key-rotation-interval` | `P30D` | hourly job rotates the active key once it is this old |
| `app.consent.auto-rotate-keys` | `true` | disable the scheduled rotation |
| `app.consent.rsa-key-size` | `2048` | |

Never enable DEBUG logging for `org.jooq`: it logs bind values (attribute values) .

## Tests

`./mvnw -pl consent-gateway -am verify`. Highlights (all deterministic: injected `MutableClock`, no sleeps, real Postgres):

* `PolicyEngineTest`, `ScopeTest`: table-driven; deny-by-default, expiry boundaries, `max_reads`, scope narrowing,
  segment-exact prefixes, time windows incl. time zones and midnight wrap.
* `TokenIssuerTest`: issue / offline verify via JWKS / expire (with skew) / rotate (old `kid` verifies, new tokens use the
  new `kid`, JWKS shows both, then drops the old one) / forged tokens (`none`, HS256 confusion, wrong key, swapped
  payload) / introspection / revocation / client vs access token separation / Firebase vs gateway chain separation.
* `ConsentFlowTest`: the whole flow, narrowing-only approval, revocation effective on the very next read, `max_reads`,
  grant expiry, hours window, sensitivity ceiling, `profile.sizes` vs `profile.sizes_secret`.
* `VaultAndIsolationTest`: CRUD; user B cannot read/modify user A's vault, clients, requests, grants or audit log.
* `AuditChainTest`: DB trigger blocks UPDATE/DELETE/TRUNCATE; tampering (with the trigger disabled via ALTER TABLE) is
  detected: edited entry, edit with recomputed hash, deleted middle entry, truncated tail; concurrent appends keep the
  chain intact; concurrent reads never exceed `max_reads`.
* `SecretHandlingTest`: secrets stored only as bcrypt hashes, absent from every table, API response and captured logs
  (also tokens, private key material, the KEK); signing keys encrypted at rest and bound to their `kid`.
* `KeyEncryptionKeyStartupTest`: no KEK -> no startup (except `dev`). `sql-jooq`'s `ConsentSchemaTest`: migrations,
  generated classes vs real DB, trigger, single-active-key index.

## Limitations and next steps (honest list)

* **A client belongs to the owner who registered it**, and its requests go to that owner. A true multi-tenant model
  (one third-party app serving many people, discovering/addressing an owner, a hosted consent screen with redirect flow)
  is not built; `redirect_uri` is stored but unused.
* **Vault values are plaintext `jsonb`** in Postgres (no application-level encryption of values). Only signing keys are
  encrypted at rest. Use disk/DB encryption, or add envelope encryption per attribute.
* **The audit chain is tamper-evident, not tamper-proof.** A DB superuser/table owner can disable the trigger (the
  tests do) and a determined attacker can rewrite a whole chain consistently including the head row. Mitigation not
  built: periodically anchor `headHash` outside the database (owner's device, transparency log, WORM storage).
* The signing-key KEK comes from an env var (no KMS/HSM, no KEK rotation / re-encryption tool). Key rotation is a
  scheduled job plus `SigningKeyService.rotate()`; there is no admin HTTP endpoint (this service has no admin role).
  Multiple instances converge on a rotation within the 30 s key cache.
* No rate limiting or lockout on `/v1/oauth/token` and friends; bcrypt cost is the only brake. Add a gateway/WAF limit.
* One "read" = one allowed `GET /v1/gateway/data` call (even if it returns zero attributes), not one per attribute.
* A grant's hours window is hours-of-day only (no weekdays); the owner can set a window broader than requested.
* `issued_tokens` rows are never purged; add a retention job. Each gateway request costs 2-3 small DB reads
  (token record, client, grant): fine for this product, cache if it ever matters.
* `purpose` is a free-text equality check, not a managed taxonomy.
* Not verified: running the packaged jar against the local Postgres on :5433 with real Firebase tokens, load behaviour,
  and anything outside the automated tests above.
