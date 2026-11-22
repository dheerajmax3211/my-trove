# platform-service

Usage metering, plans and quotas, analytics, feature flags, and the developer platform (apps, API keys, scopes,
webhooks). Schema `platform`, port 8089. Every caller-facing route is reached through the gateway on :8080, which
authenticates the caller, exchanges the credential for a platform token and enforces the route policy.

## Developer platform (W4)

All routes are under `/v1/developer`. They take a platform token (or a service token, for keys, see below) and need
the permission listed. Responses are JSON; errors are RFC 9457 problem bodies. The OpenAPI document is at
`/v3/api-docs` (public, internal routes excluded); the gateway lists it at `/api/platform/v1/docs`.

| Route | Permission | Purpose |
|---|---|---|
| `POST /apps` | `apps:manage` | Register an app: `name`, `description`, `redirectUris`. Returns `clientSecret` once. |
| `GET /apps`, `GET /apps/{id}` | `apps:manage` | The caller's apps. Never include the secret. |
| `PUT /apps/{id}` | `apps:manage` | Change name, description, redirect URIs. |
| `POST /apps/{id}/client-secret/rotate` | `apps:manage` | New secret, returned once; the old one stops matching. |
| `POST /apps/{id}/client-secret/revoke` | `apps:manage` | Clears the secret digest. |
| `DELETE /apps/{id}` | `apps:manage` | Revokes the app. Its keys stop verifying. |
| `POST /apps/{appId}/keys` | `keys:manage` | Issue a key: `name`, `scopes[]`, optional `expiresAt`. The `key` is returned once. |
| `GET /apps/{appId}/keys` | `keys:manage` | Keys of the app (no key values). |
| `DELETE /keys/{keyId}` | `keys:manage` | Revoke a key. |
| `GET /scopes` | `keys:manage` | The scope catalogue and the permissions each scope grants. |
| `POST /apps/{appId}/webhooks` | `webhooks:manage` | Create an endpoint: `url`, `description`, `eventTypes[]`. Returns `secret` once. |
| `GET /apps/{appId}/webhooks` | `webhooks:manage` | Endpoints of the app (no secrets). |
| `DELETE /webhooks/{id}` | `webhooks:manage` | Disable an endpoint; its log stays readable. |
| `POST /webhooks/{id}/secret/rotate` | `webhooks:manage` | New signing secret, returned once. |
| `GET /webhooks/{id}/deliveries` | `webhooks:manage` | Delivery log, newest first (last 100). |
| `POST /webhooks/{id}/deliveries/{deliveryId}/replay` | `webhooks:manage` | Redeliver the same event as a new delivery (202). |
| `GET /webhook-events` | `webhooks:manage` | The event types an endpoint can subscribe to. |

Every operation is scoped to the owner: another developer's app, key or endpoint is reported as 404.

### Limits by plan

Taken from the platform token's `plan` claim and `platform.plans`:

| Plan | Active API keys | Active webhook endpoints | Requests per minute | Requests per month |
|---|---|---|---|---|
| FREE | 3 | 1 | 120 | 10,000 |
| PRO | 10 | 5 | 600 | 200,000 |
| DEVELOPER | 50 | 20 | 1,200 | 1,000,000 |

Exceeding a key or endpoint limit is `409`. Revoking a key, or disabling an endpoint, frees its slot.

### API keys

- Format: `pk_` + 8 hex characters + `_` + a random secret. The first eleven characters identify the row; only the
  SHA-256 of the whole key is stored. The key value is returned once, on issue.
- Scopes come from the catalogue (`GET /v1/developer/scopes`). Each scope grants permissions. Today: `usage:read`
  grants `usage:read:self`.
- The gateway accepts `Authorization: Bearer pk_...`. Auth verifies the key with the internal endpoint
  `POST /internal/v1/api-keys/verify` (shared internal key) and issues a service token: `sub = app:<appId>`,
  `token_use = service`, `scopes[]`, `permissions[]`, `key_id`, `owner_uid`, the owner's plan.
- A key reaches only the routes listed in `gateway.api-key-routes` (gateway config), and only with the permission
  each route names. Every other route is refused with `403`, whatever the key holds.
- A revoked, expired, or unknown key is `401`. A key of a revoked app is `401`.
- `lastUsedAt` is written at most once a minute per key.
- Revocation reaches the gateway within 60 seconds: the gateway reuses an exchanged credential for its cache TTL.

### Webhooks

**Events in.** Product services publish domain events to `platform.domain.events.v1`, as JSON:

```json
{"eventId": "<uuid>", "type": "reminder.created", "occurredAt": "2031-03-15T10:00:00Z",
 "ownerUid": "<internal user id>", "data": {}}
```

Unreadable events (not JSON, or missing `eventId`, `type` or `ownerUid`) go to `platform.domain.events.v1.dlq`.
Events are fanned out only to the owner's active endpoints subscribed to that type. Fan-out is idempotent per
(endpoint, event): a redelivered Kafka record adds nothing.

**Deliveries out.** `POST` to the endpoint URL with these headers:

| Header | Value |
|---|---|
| `X-Trove-Event-Id` | the event's id |
| `X-Trove-Event-Type` | e.g. `reminder.created` |
| `X-Trove-Delivery-Id` | this delivery's id (a replay has its own) |
| `X-Trove-Timestamp` | Unix seconds when the delivery was signed |
| `X-Trove-Signature` | `t=<unix seconds>,v1=<hex>` |

Verify the signature: compute `HMAC-SHA256(secret, "<t>." + rawBody)` as lower-case hex, compare it to `v1` in
constant time, and refuse a `t` more than five minutes from your clock. Any 2xx answer is success; anything else, or no
answer within five seconds, is a failure.

**Retries.** A failed delivery is retried after 1 minute, then 5, 30, 120 and 720 minutes. The sixth failed attempt
marks it `DEAD`; a dead delivery is never sent again on its own and can be replayed by hand. Each delivery is leased
for five minutes while a worker sends it, so a worker that dies mid-send leaves it to be retried.

**Endpoint URLs.** `https`, or `http` on `localhost` or `127.0.0.1` only (for local development).

### Configuration

| Setting | Default | Meaning |
|---|---|---|
| `APP_INTERNAL_API_KEY` | (none) | Shared secret of the internal chain (`/internal/**`), also used by auth and the gateway. |
| `app.webhooks.domain-topic` | `platform.domain.events.v1` | Domain event topic. |
| `app.webhooks.domain-dlq-topic` | `platform.domain.events.v1.dlq` | Dead-letter topic for unreadable events. |
| `app.webhooks.worker-enabled` | `true` | Runs the delivery worker. Tests switch it off and call `deliverDue()` themselves. |
| `app.webhooks.worker-interval` | `PT2S` | How often the worker looks for due deliveries. |
| `springdoc.paths-to-exclude` | `/internal/**` | Keeps internal routes out of the OpenAPI document. |

## Tests

`./mvnw -pl platform-service -am test` (needs Docker; see the root README). The developer platform is covered by
`DeveloperAppsTest`, `ApiKeysTest`, `WebhooksTest` (fan-out, signed delivery, backoff schedule to dead-letter, replay,
owner scoping, secret rotation, the dead-letter topic), `webhooks/WebhookSignatureTest` (signing, verification, retry
schedule), and `OpenApiDocsTest`. The end-to-end proof against a running stack is `dev/e2e-developer.sh`.

## Not built, and why

- **No developer UI.** The developer console is W5; everything above is API only.
- **No domain event producers yet.** Reminder, approval and consent services do not publish to
  `platform.domain.events.v1`. Until they do, webhooks deliver only events published by hand or by tests.
- **Only `usage:read` is a scope.** Scopes for product routes (items, consent, reminders) need those services to accept
  service tokens and check `permissions`. They are not in the catalogue because nothing enforces them yet.
- **Signing secrets are stored in full** (a hash cannot sign). Encrypting them at rest is a follow-up.
- **No OAuth client-credentials flow.** App client secrets are generated, rotated and revoked, but nothing exchanges
  them yet; consent-gateway's OAuth flow is a later item.
- **OpenAPI is published by this service only.** The other services need the same springdoc setup before the gateway
  index reports them as available.
