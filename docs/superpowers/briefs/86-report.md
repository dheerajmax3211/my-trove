# 86 report: API keys act for their owner

Status: **DONE_WITH_CONCERNS**. Concern 1: the live run hit a broken shared waiting-on process. Concern 2: the
gateway-mode e2e run was not done.
Branch: `worktree-agent-a4feebb1ff43ceada`. Fast-forwarded to `4bd91de` first. The run stopped once on an API usage
limit and resumed in the same worktree.

## What was built

**platform-service**
- `POST /internal/v1/api-keys/status` `{keyId}` (internal chain, `X-Internal-Key`). It returns
  `{keyId, appId, ownerUid, state, permissions}` with state `ACTIVE | REVOKED | EXPIRED | APP_DISABLED`, and 404 for
  an unknown id. It never returns the key value or its hash. auth uses it to re-check a key at delegation time,
  because by then only the service token is known, not the key.
- New key scope `products:read`, which grants `products:use`. Without it, "a key reads the owner's data" is
  impossible, because no scope granted the product permission. The gateway's `api-key-routes` opens no product route
  to keys, so this permission only matters through the MCP tools. A key with only `usage:read` still cannot use MCP.

**auth**
- The service token from the key exchange now also carries `act: {"sub": "<owner internal uid>"}` (RFC 8693 style).
  `owner_uid` is kept. Permissions are still the key's only.
- `POST /internal/v1/token/delegate` `{serviceToken}` sits behind a new `/internal/**` chain: `X-Internal-Key` equal
  to `APP_INTERNAL_API_KEY`, a constant-time compare, and a blank configured key denies everything. A sign-in bearer
  is not accepted there. The endpoint:
  1. Verifies the service token itself (`ServiceTokenVerifier`): RS256 by one of auth's own signing keys, its issuer,
     audience, `token_use=service`, not expired, and well-formed `app:`/`key_id`/`owner_uid` claims.
  2. Asks platform-service for the key's status. It refuses with these codes: revoked or unknown key
     `API_KEY_REVOKED`, `API_KEY_EXPIRED`, `APP_DISABLED`, and `API_KEY_MISMATCH` when the app or owner no longer
     matches the token. All are 403. An outage is 503.
  3. Loads the owner: unknown gives `OWNER_UNKNOWN` and suspended gives `USER_SUSPENDED` (both 403).
  4. Issues a user-shaped platform token for the owner. `sub` is the owner's Firebase uid, plus uid, email, name and
     plan. `roles` is empty, so no role check can grant more. Permissions are the owner's current permissions AND the
     token's permissions AND the key's current permissions. `act` is `{"sub": "app:<appId>", "key_id": ...}`. The
     token lives 5 minutes and never outlives the service token.
- Defence in depth: auth reads permissions from the DB, not the token. So in auth's JWT converter, a token with an
  `act` **object** gets only the DB permissions it also carries, and no roles. Impersonation's existing string `act`
  is unchanged.

**sql-jooq / mcp-server**
- Migration `mcp/V2__mcp_audit_on_behalf_of.sql` adds a nullable `tool_calls.on_behalf_of` column plus an index.
- `Caller` gains `onBehalfOf`, read from `act.sub` or else `owner_uid`. The audit writes it, so an API-key row reads
  `principal_id = app:<appId>` and `on_behalf_of = <owner uid>`.
- `OwnerDelegation` calls auth directly (`app.mcp.delegation.auth-url` = `AUTH_URL`, plus the internal key). It
  verifies the returned token with the normal decoder and also checks `token_use=platform` and that `act.sub` is
  this app. No caching.
- `ToolRegistry` checks in this order:
  1. The key token must carry the tool permission; otherwise `forbidden`, and auth is not called.
  2. Delegate.
  3. The delegated token must carry the permission; otherwise `forbidden`, because the owner lacks it.
  4. Call the tool with the delegated token.

  An auth refusal becomes `delegation_refused` (outcome DENIED, with `reason`). Auth being unreachable becomes
  `unavailable`. The old `api_key_not_supported` is no longer produced. The constant is kept so old audit rows still
  map.
- Wiring: `AUTH_URL` for mcp-server in Compose and Helm (`APP_INTERNAL_API_KEY` already reached it). `dev/up.sh`
  needed no change, since the defaults match and it exports `APP_INTERNAL_API_KEY`.

**Docs / script**
- `mcp-server/README.md`: diagram, an "API keys act for their owner" section, the audit column, which key scopes to
  use, the config table, test counts and an honest status.
- `docs/security/threat-model.md`: new row 16 for API keys, with its controls and evidence.
- `dev/e2e-mcp.sh`: an API-key run as developer@example.test. It creates the app and keys the way
  `e2e-developer.sh` does:
  - a usage-only key gets 403 at `/mcp`;
  - an mcp-only key lists the tools but the tools refuse it;
  - an `mcp:use`+`products:read` key gets data from all 4 tools;
  - there are 4 OK audit rows with the app and owner;
  - after revocation the very next tool call is `delegation_refused`, even with the still-valid exchanged token, and
    that refusal is audited.

  A new direct mode (`AUTH_URL`, `MCP_URL`, `PLATFORM_URL`) exchanges credentials itself so changed services can be
  tried on spare ports.

## Tests (all run with `./mvnw -B -ntp -pl <module> -am verify`, Colima Docker)

| Module | Result | New / changed |
|---|---|---|
| auth | 102, 0 failures | new `DelegationTest` 15 (claims, 5-min TTL, capped at the service token's expiry, intersection with a MEMBER owner, key permissions shrunk, suspended owner, revoked / unknown / expired key, disabled app, mismatch, wrong or missing internal key, sign-in bearer refused, expired / foreign-signed / non-service / other-issuer / garbage token); `ActingTokenAuthoritiesTest` 2; `ApiKeyExchangeTest` asserts `act`; `PlatformServiceApiKeyVerifierTest` +2 (status) |
| platform-service | `ApiKeysTest` 18, 0 failures (+4: `products:read` scope, status active/revoked/expired/app-disabled, internal key needed, 404) | only `ApiKeysTest` was run for platform-service, not the whole module (see below) |
| sql-jooq | 76, 0 failures | `McpSchemaTest` +1 (`on_behalf_of`) |
| mcp-server | 47, 0 failures | new `ApiKeyDelegationTest` 7; the old "API key refused" test was replaced by "a person's call never goes through delegation"; `StubService` records the internal-key header and the body |
| platform-security | 45, 0 failures | unchanged (ran as a dependency) |

**Not run:** the full platform-service module (only `ApiKeysTest`; the change touches only the developer package and
the scope catalogue, and `catalogueListsTheScopes` still passes). The full reactor was not run either.

**Live run (2026-11-27).** I started second instances of auth (:18081), platform-service (:18089, with its Kafka
listener and webhook worker turned off so they would not compete) and mcp-server (:18090) from this worktree,
against the shared dev Postgres, IdP and product services. Then I ran `dev/e2e-mcp.sh` in direct mode: **21 of 24
checks passed.**
- The 3 failures are all `waiting_on_list_followups`, both as the owner and as the key, plus the audit count of 4
  that depends on it.
- The cause is the shared waiting-on on :8083. It answers 500 to every request, also straight through the gateway
  with no MCP involved. Its log shows `ClassNotFoundException: org.apache.catalina.util.RequestUtil`, which looks
  like its jar was replaced under the running process.
- I did not restart it, since it is shared.

All API-key checks against the other three products passed, including immediate revocation and the audit rows. The
second instances were stopped afterwards. The shared ones were never touched.

Also checked: `helm template` with the kind values renders `AUTH_URL` for mcp-server; `docker compose config` with
placeholder env passes and has `AUTH_URL`; `bash -n` on the script passes.

**Not verified:**
- A gateway-mode run with these changes deployed. The shared gateway still routes to the old mcp-server, auth and
  platform-service.
- A real MCP client.

## Concerns and decisions

1. **Shared-DB side effects of the live run.** mcp-server's V2 migration was applied to the shared dev database
   (additive, nullable column; the old mcp-server keeps working). The run also left an app named "MCP e2e <ts>" for
   developer@example.test; all three of its keys were revoked.
2. **Delegation is not cached.** Every tool call costs one auth call, which in turn costs one platform-service call.
   I chose immediate revocation over latency. A short cache keyed by the service token's jti could be added later.
3. **New scope `products:read`, granting `products:use`.** Product services treat `products:use` as read and write.
   It is safe today because only mcp-server ever holds the delegated token, and the tools are read-only. If keys
   ever get product routes at the gateway, use a narrower permission.
4. **Two `act` shapes now coexist.** Impersonation (not built end to end) still issues a plain-string `act`, while
   API-key tokens use the RFC 8693 object. The design doc 5.3 still says "impersonator uid". I left it alone because
   it is out of scope.
5. **Pre-existing, not changed:** if a service token ever reached auth's own API, `users.resolve` would treat
   `app:<id>` as a Firebase uid. Keys cannot reach auth through the gateway (no api-key route), so I only note it.
6. **Frontend not touched.** The Developer section's scope list and catalogue do not show `products:read` yet.
   Backend-only brief.

## Commits

- `e2e9ab7` platform: internal API-key status by id; products:read key scope (products:use, MCP only)
- `82d7144` auth: service tokens name their owner in act; internal delegated-token endpoint for API-key owners
- `3e61537` mcp-server: API-key callers act for their owner through auth's delegated token; audit records app and owner
- `a441cd2` docs: API keys act for their owner (mcp-server README, threat-model row 16); dev/e2e-mcp.sh API-key run and direct mode
- (this report)
