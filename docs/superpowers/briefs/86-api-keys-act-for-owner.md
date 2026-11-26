# 86: API keys act for their owner (MCP and other key routes)

Read `80-common.md` first (it applies in full). Report: `docs/superpowers/briefs/86-report.md`.

Gap (from brief 82's report, `docs/superpowers/briefs/82-report.md`, read it): an API key's exchanged token is a
service token (`token_use=service`, `sub=app:<appId>`) that never acts as the person who created the key, so the MCP
tools refuse it and a key cannot read the owner's product data.

Design (follow it unless the code shows a better fit; say why if you deviate):
- When auth exchanges an API key (`ApiKeyBearer` / exchange controller), it already knows the key's app and the app's
  owner (check platform-service's developer apps/keys tables and what auth receives). Issue the service token with an
  `act` claim naming the owner (`act: {"sub": "<owner uid>"}`, RFC 8693 style) and the key's scopes mapped to
  permissions, as today.
- Add a delegated-token path: a service holding such a service token and the internal key can ask auth
  (`POST /internal/v1/token/delegate`, `APP_INTERNAL_API_KEY`) for a short-lived (5 min) user-shaped platform token for
  the owner whose permissions are the intersection of the owner's current permissions and the key's permissions
  (never more than either), carrying `act` = the app (so audits show "app X acting for user Y"). Refuse if the owner
  is suspended, the key is revoked, or the app is disabled.
- `mcp-server` uses that path when the caller is an API key, then calls product services with the delegated token
  exactly as it does for people. Its audit row records both the app and the owner.
- Never give a key more than its scopes; a key with only `usage:read:self` still cannot use MCP tools.
Tests: auth (exchange carries `act`; delegate: intersection, suspended owner, revoked key, disabled app, wrong internal
key, expiry), mcp-server (key caller gets data through delegation; key without the product permission refused; audit
shows app and owner), and extend `dev/e2e-mcp.sh` with an API-key run (create app and key as developer@example.test the
way `dev/e2e-developer.sh` does). Run it live: the dev stack is up (gateway :8080, dev IdP :9100, all services); you may
start a second instance of a service you changed on a spare port against the same infrastructure, never restart or
kill the shared ones. Update `mcp-server/README.md` and the threat model row for API keys
(`docs/security/threat-model.md`).
