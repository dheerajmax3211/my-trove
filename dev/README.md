# Local dev stack: real services, no Firebase project

Runs the gateway, all nine Spring Boot services and the web apps against real Postgres (with TimescaleDB and pgvector) and a
real Temporal server. Sign-in uses a small local identity provider instead of Firebase, so nothing here needs an
account or a network connection.

## Start

```bash
# 1. infrastructure: Postgres (TimescaleDB + pgvector), Temporal.  On this machine: colima start --cpu 4 --memory 6
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
docker compose -f dev/docker-compose.yml up -d

# 2. jars (once, and after backend changes), then the identity provider and the services
./mvnw -DskipTests package
dev/up.sh                       # or: dev/up.sh auth shared-service

# 2b. prove it: 33 end-to-end checks through the gateway (personas, suspension, rate limits, metering)
dev/e2e-phase1.sh        # needs dev/up.sh in dev-identity-provider mode (the default)

# 3. the web apps (each app's .env.local already points at the identity provider)
dev/web.sh               # the workspace (5190) and the public site (5191)
dev/web.sh all           # also the seven standalone product apps (5181-5187)
```

Stop with `dev/down.sh` and `docker compose -f dev/docker-compose.yml stop`. Logs: `dev/.state/logs/<service>.log`.
Open http://localhost:8233 for the Temporal UI.

The root `docker-compose.yml` (plain `postgres:16`) uses the same port 5433; stop it first if it is running.

## Architecture of the stack

```
 browser ──► gateway :8080 ──► auth :8081 (identity provider, roles, token exchange)
                │   │     ├──► shared, waiting-on, consent, home-pulse, ask-your-life,
                │   │     │    digital-legacy, family-treasury   (:8082-8088, verify platform tokens)
                │   │     └──► platform-service :8089 (usage analytics, plans, quotas)
                │   └─ usage events ─► Kafka :9092 ─► platform-service ─► Timescale (platform schema)
                └─ Firebase ID token ─► auth /v1/token/exchange ─► short-lived platform token (roles, permissions, plan)
```

Every app calls `http://localhost:8080/api/<service>/v1/...` (`use-firebase.sh` writes that into each `.env.local`).
The gateway authenticates the caller, exchanges the credential for a platform token (cached 60 s), checks the route's
permission, applies the plan's rate limit and quota, forwards, and meters the call to Kafka. Services started by
`up.sh` run with `APP_SECURITY_MODE=platform`. Roles and permissions: `docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md` §5.2.

## How sign-in works

`dev/dev-idp.mjs` (zero dependencies, 127.0.0.1:9100) mints RS256 tokens shaped like Firebase ID tokens
(issuer `https://securetoken.google.com/demo-platform`, audience `demo-platform`) and serves the matching JWKS.
The services need no code change: `dev/up.sh` sets `FIREBASE_PROJECT_ID=demo-platform` and
`APP_FIREBASE_JWK_SET_URI=http://localhost:9100/jwks`, and the normal Firebase verification runs unchanged
(signature, issuer, audience, expiry).

In the browser, `VITE_DEV_IDP_URL=http://localhost:9100` switches `@platform/auth-web` to a dev client
(`createDevIdpAuthClient`). "Continue with Google" signs in as `dev@example.test`; "Email me a link" signs in as
whatever address you type, immediately. `dev@example.test` is the bootstrap admin (`BOOTSTRAP_ADMIN_EMAILS`).
Different emails are different users, which is the quickest way to test sharing and approvals.

The identity provider only answers CORS requests from localhost origins and binds to loopback. It must never be
reachable from a network, and the services must never be pointed at it outside development.

## Real Firebase

See [`FIREBASE.md`](FIREBASE.md): create a project, run `dev/use-firebase.sh` for the apps and
`REAL_FIREBASE=1 dev/up.sh` for the services. Not yet exercised: no Firebase project exists for this repo.

## What is real and what is not

Real: Postgres schemas and migrations (including Timescale hypertables and pgvector indexes), Flyway, jOOQ queries,
Temporal workflows, the consent gateway's own token issuer, every HTTP contract the apps use.
Not real: sign-in (above), notification delivery (log-only senders), the MQTT adapter (off), and the embedder in
ask-your-life (a deterministic local one, so semantic search is approximate).
