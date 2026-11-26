# Deploying My-Trove

This guide takes the platform from a git commit to a running Kubernetes install. Everything here is free and
self-hostable. What is verified, and what is not, is listed at the end.

## What gets deployed

```
            internet
               │  (Ingress, TLS)
   ┌───────────┼──────────────────────────┐
   │ api.*     │ app.*            www.*   │
   ▼           ▼                  ▼
 gateway    workspace (nginx)   site (nginx)
   │ the only public entrance to the backends
   ├── auth ── platform-service ── Kafka (usage events)
   ├── shared-service   waiting-on ── Temporal
   ├── consent-gateway  home-pulse   ask-your-life
   └── digital-legacy   family-treasury
                 │
            PostgreSQL 16 + TimescaleDB + pgvector (one database, a schema per service)
```

The Helm chart (`deploy/helm/my-trove`) installs the twelve workloads: the gateway, nine backend services, the
workspace and the public site. It does **not** install PostgreSQL, Kafka, Temporal, an SMTP relay or an OpenTelemetry
collector. Run those as managed services or install them separately, and point the chart at them.

## Option A: one machine with Docker Compose

The cheapest way to run everything: one VM (8 GB RAM is enough for one user and light traffic) with Docker.
`deploy/compose/compose.yaml` runs the twelve images plus PostgreSQL (TimescaleDB + pgvector), Kafka and Temporal.
Only the gateway (8080), workspace (5190) and site (5191) publish ports, on `127.0.0.1` by default; put a TLS reverse
proxy such as Caddy in front of them.

```bash
TAG=<git sha> FIREBASE_PROJECT_ID=<your project> deploy/compose/init-env.sh   # random secrets, mode 600, never overwritten
docker compose -f deploy/compose/compose.yaml --env-file deploy/compose/.env up -d
```

To try it with no Firebase project, add `--profile dev-idp` and set `APP_FIREBASE_JWK_SET_URI=http://dev-idp:9100/jwks`
in the `.env` file; `dev/seed-personas.sh` then creates the owner, admin, developer, member and auditor accounts. To sign
in from the browser too, build the workspace image with `--build-arg VITE_DEV_IDP_URL=http://localhost:9100`.

## Option B: Kubernetes with Helm

The rest of this guide covers the chart.

## 1. Infrastructure you provide

| Dependency | Requirement | Used by |
|---|---|---|
| PostgreSQL 16 | Extensions `timescaledb` and `vector` available. The application user must be able to create schemas, extensions and one role (`ask_life_app`, for row-level security), so it needs `CREATEROLE` and the right to create those extensions. Migrations (Flyway) run when each service starts. | every backend except the gateway |
| Kafka | One bootstrap address. Topic `platform.usage.v1` is auto-created, or create it yourself. | gateway (produces), platform-service (consumes) |
| Temporal | A frontend address and namespace. Set `temporal.enabled=false` to run without durable follow-ups. | waiting-on |
| Firebase project | Firebase Authentication with Google and email-link sign-in. The project id goes in `common.firebaseProjectId`; the web config goes into the web image build. | sign-in |
| SMTP relay | Optional (`mail.enabled`). Any relay with a login works (free tiers of Brevo or SES, or Gmail with an app password): set `mail.host`, `mail.port` (587), `mail.username`, `mail.starttls: true` and the optional `MAIL_PASSWORD` Secret key. STARTTLS is required when enabled, never opportunistic. Without a relay, emails are not sent. | shared-service |
| OTLP collector | Optional. Traces go to `common.otlpTracesEndpoint`; an unreachable collector never slows requests (tested). | every backend |
| Prometheus | Optional. Scrapes each pod's management port (annotations `prometheus.io/*`) from the `monitoring` namespace. | metrics |

The image `timescale/timescaledb-ha:pg16.16-ts2.32.1` has both extensions and is what dev and the CI smoke test use.

## 2. Secrets

Create one Kubernetes Secret with these keys, outside Helm (kubectl, sealed-secrets or external-secrets), and set
`secrets.existingSecret` to its name. The chart refuses to render without it.

| Key | What it is | Generate |
|---|---|---|
| `DB_PASSWORD` | the application database user's password | your database |
| `APP_INTERNAL_API_KEY` | shared key between the gateway and platform-service for `/internal/**` | `openssl rand -base64 32` |
| `APP_PLATFORM_KEY_ENCRYPTION_KEY` | encrypts auth's token-signing keys at rest; exactly 32 bytes, base64 | `openssl rand -base64 32` |
| `CONSENT_KEY_ENCRYPTION_KEY` | encrypts consent's token-signing keys at rest; exactly 32 bytes, base64 | `openssl rand -base64 32` |
| `FILE_TOKEN_SECRET` | signs expiring download links | `openssl rand -base64 32` |
| `INBOUND_WEBHOOK_SECRET` | the `X-Webhook-Secret` an inbound-email provider sends to waiting-on | `openssl rand -base64 32` |

```bash
kubectl create namespace trove
kubectl -n trove create secret generic trove-secrets \
  --from-literal=DB_PASSWORD='...' \
  --from-literal=APP_INTERNAL_API_KEY="$(openssl rand -base64 32)" \
  --from-literal=APP_PLATFORM_KEY_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --from-literal=CONSENT_KEY_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --from-literal=FILE_TOKEN_SECRET="$(openssl rand -base64 32)" \
  --from-literal=INBOUND_WEBHOOK_SECRET="$(openssl rand -base64 32)"
```

The two key-encryption keys cannot be rotated by changing the Secret: the signing keys already stored would no
longer decrypt and auth or consent would refuse to start (loudly, by design). Keep them in a backup.

## 3. Images

CI (`.github/workflows/release.yml`) builds every image on each push to `main`, scans it with Trivy (failing on any
fixable HIGH or CRITICAL finding), writes a CycloneDX SBOM, and pushes it to
`ghcr.io/<owner>/my-trove/<name>:<git sha>`. Pull requests build and scan the same images without pushing.

The web images inline their configuration at build time. Set these repository variables (Settings → Secrets and
variables → Actions → Variables) before the first production build: `VITE_API_BASE_URL` (for example
`https://api.example.com/api`), `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_APP_ID`, `VITE_SITE_URL`, `VITE_WORKSPACE_URL`. The Firebase web config is public by design.

To build locally instead:

```bash
./mvnw -DskipTests package
docker build -f deploy/docker/service.Dockerfile --build-arg MODULE=gateway -t my-trove/gateway:dev .
docker build -f deploy/docker/web.Dockerfile --build-arg APP=workspace \
  --build-arg VITE_API_BASE_URL=https://api.example.com/api -t my-trove/workspace:dev .
```

Service images run as uid 10001 on a read-only root filesystem; web images run unprivileged nginx on port 8080.
Each web image carries a Content-Security-Policy generated at build time from its `index.html` and the API and
Firebase origins you build it with (`deploy/docker/csp.mjs`), so rebuild the web images when the API origin changes.
GHCR packages are private by default: make them public, or add an `imagePullSecrets` entry.

## 4. Install

Write a values file for your environment (start from `deploy/helm/my-trove/values.yaml`):

```yaml
image:
  tag: "<git sha CI built>"
common:
  db: { url: jdbc:postgresql://<host>:5432/platform, user: platform }
  firebaseProjectId: <your firebase project id>
  kafkaBootstrapServers: <kafka>:9092
  otlpTracesEndpoint: http://<collector>:4318/v1/traces
secrets:
  existingSecret: trove-secrets
urls:
  workspace: https://app.example.com
  site: https://www.example.com
  api: https://api.example.com
  consentIssuer: https://api.example.com/api/consent
bootstrapAdminEmails: you@example.com      # granted OWNER on first sign-in
temporal: { target: <temporal-frontend>:7233 }
files: { persistentVolumeClaim: trove-files }   # uploaded files; without it they are lost with the pod
ingress:
  enabled: true
  className: nginx
  hosts: { api: api.example.com, app: app.example.com, www: www.example.com }
  tls: [{ secretName: trove-tls, hosts: [api.example.com, app.example.com, www.example.com] }]
```

```bash
helm upgrade --install trove deploy/helm/my-trove -n trove -f my-values.yaml --wait --timeout 15m
kubectl -n trove get pods
```

Add the workspace origin to the Firebase project's authorised domains.

## 5. Operating it

- **Health:** each backend serves `/actuator/health/liveness` and `/actuator/health/readiness` on its management
  port (main port + 1000). The chart wires them to the startup, liveness and readiness probes.
- **Metrics:** `/actuator/prometheus` on the same management port. NetworkPolicy admits it only from the namespace in
  `networkPolicy.monitoringNamespace`. The dashboard in `dev/observability/grafana/dashboards/trove-overview.json`
  works unchanged against an in-cluster Prometheus. The p95 panel needs histogram buckets: set
  `common.extraEnv.MANAGEMENT_METRICS_DISTRIBUTION_PERCENTILESHISTOGRAM_HTTP_SERVER_REQUESTS: "true"` if you want it.
- **Traces:** sampled at `common.tracingSampling` (default 0.1). Gateway spans record paths, never query strings, so
  signed download tokens do not reach the trace store.
- **Network:** NetworkPolicy is default-deny. The gateway, workspace and site accept their HTTP port from anywhere;
  backends accept their HTTP port only from other backends; management ports only from monitoring. Your CNI must
  enforce NetworkPolicy for this to mean anything.
- **Upgrades:** `helm upgrade` with a new `image.tag`. Flyway migrations run on start and are forward-only; take a
  database backup before upgrading.
- **Scaling:** the gateway runs two replicas by default. Rate limits are kept in memory per replica, so with N gateway
  replicas a user's effective limit is up to N times the plan limit. That is the known cost of not running Redis
  (ADR 0003). Backends are stateless apart from shared-service's file volume, which needs a ReadWriteMany claim
  before it runs more than one replica.

## 6. Verified and not verified

Verified on 2026-11-26 (Apple silicon laptop, Colima):
- Backend: `./mvnw verify` across every module, 1,325 tests, 0 failures (Testcontainers: Postgres, Timescale,
  pgvector, Kafka). Frontend: lint, typecheck, build, and 2,240 of 2,240 tests.
- All twelve images build. The Compose deployment of those images, with the dev identity provider, passes the
  end-to-end scripts through the real gateway: `e2e-phase1` 33/33, `e2e-personas` 73/73,
  `e2e-waiting-consent-ask` 26/26, `e2e-developer` 24/28. The four developer failures are the webhook checks: the
  script's receiver listens on the host's loopback, which a container cannot reach; the delivery correctly stays
  `PENDING` for retry. Those checks passed against the host-run dev stack when the script was written (commit
  1bd2c60); they were not rerun today.
- The web images run on a read-only filesystem and send `X-Frame-Options: DENY`, `nosniff` and a referrer policy.
- Trivy (OS packages, fixable HIGH and CRITICAL): no findings in the gateway, auth, workspace and site images. The
  nginx base was moved to 1.31.7 with `apk upgrade` after the previous base showed 52 fixable findings.
- The chart lints, renders 30 objects that pass `kubeconform -strict` against Kubernetes 1.34, and refuses to render
  without an image tag or a Secret.
- The full stack under load on one laptop: see `docs/perf/2026-11-23-baseline.md`.

Not verified yet:
- Trivy's Java dependency scan: the Java vulnerability database download failed on this network twice, so jar
  dependencies are scanned only in CI.
- The kind smoke test (`deploy/kind/smoke.sh`), the ZAP baseline and the GHCR push run in GitHub Actions only; they
  have not run until this branch is pushed.
- No install on a real cloud cluster, and no managed database, Kafka or Temporal has been tried.
- Email delivery through a real SMTP relay (dev uses Mailpit).
