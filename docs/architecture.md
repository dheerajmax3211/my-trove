# Architecture

Diagrams are Mermaid, so GitHub renders them. Each one names the code that implements it. Decisions behind them are in
[`docs/adr/`](adr/README.md); how it is deployed is in [`docs/deploy.md`](deploy.md).

## 1. System context

```mermaid
flowchart LR
  person([Person<br/>browser]) -->|HTTPS| workspace[Workspace SPA<br/>React 19]
  person -->|HTTPS| site[Public site]
  agent([AI agent<br/>MCP client]) -->|MCP over HTTPS<br/>sign-in or API key| gw
  app([Third-party app]) -->|OAuth-style consent tokens| gw
  mail([Email sender]) -->|SMTP reply| wo
  workspace -->|/api/&lt;service&gt;| gw[Gateway<br/>Spring Cloud Gateway :8080]
  firebase[(Firebase Auth)] -.ID token.-> workspace
  gw --> auth[auth :8081<br/>RBAC, platform tokens, JWKS]
  gw --> platform[platform-service :8089<br/>plans, usage analytics, developer apps]
  gw --> shared[shared-service :8082<br/>households, reminders, files, email]
  gw --> wo[waiting-on :8083<br/>Temporal follow-ups, inbound SMTP]
  gw --> consent[consent-gateway :8084<br/>scoped grants, hash-chained audit]
  gw --> hp[home-pulse :8085<br/>TimescaleDB telemetry, anomalies]
  gw --> ayl[ask-your-life :8086<br/>hybrid search, Model2Vec, RLS]
  gw --> dl[digital-legacy :8087<br/>dead-man's switch, client-side crypto]
  gw --> ft[family-treasury :8088<br/>double-entry ledger]
  gw --> mcp[mcp-server :8090<br/>audited, consent-scoped tools]
  mcp --> wo & ayl & hp & ft
```

All backends verify the platform token themselves; the gateway is the only public entrance (ADR 0001). One PostgreSQL
16 database holds a schema per service (TimescaleDB for home-pulse, pgvector for ask-your-life). Kafka carries usage
events; Temporal runs Waiting On's follow-ups.

## 2. A signed-in request

```mermaid
sequenceDiagram
  participant B as Browser (workspace)
  participant G as Gateway
  participant A as auth
  participant S as Product service
  participant K as Kafka
  B->>G: GET /api/waiting-on/v1/items (Firebase ID token)
  G->>A: POST /v1/token/exchange (cached 60 s per credential)
  A-->>G: platform token (RS256: roles, permissions, plan, permissions_version)
  G->>G: route permission check, per-minute limit (ADR 0007), quota for API keys
  G->>S: forwarded with the platform token
  S->>S: verify signature against auth's JWKS, @PreAuthorize on the handler
  S-->>G: 200 + body
  G--)K: usage event (best effort, bounded buffer, never blocks: ADR 0004)
  G-->>B: 200 + X-RateLimit-* headers
```

Code: `gateway/.../security/ExchangeFilter.java`, `gateway/.../ratelimit/RateLimitFilter.java`,
`libs/platform-security`, `auth/.../token/`.

## 3. Usage metering and analytics

```mermaid
flowchart LR
  gw[Gateway] -->|platform.usage.v1| kafka[(Kafka)]
  kafka --> consumer[platform-service consumer<br/>idempotent on event id]
  consumer --> hyper[(usage_events<br/>Timescale hypertable)]
  hyper --> agg[(continuous aggregates<br/>per minute, per day)]
  agg --> api[/owner analytics, self usage,<br/>quota lookups/]
  api -->|plans, quota (background, fail-open)| gw
```

## 4. A Waiting On follow-up

```mermaid
stateDiagram-v2
  [*] --> AwaitingNudge: item created (workflow started)
  AwaitingNudge --> Nudged: day N, friendly nudge sent
  AwaitingNudge --> Escalated: refusal reply (skips the nudge)
  Nudged --> Escalated: day M, escalation letter drafted
  Escalated --> FinalNotice: optional final notice
  FinalNotice --> Expired: no resolution by the plan's end
  Escalated --> Expired
  AwaitingNudge --> Resolved: PAID reply (email or paste) or user resolves
  Nudged --> Resolved
  Escalated --> Resolved
  AwaitingNudge --> Cancelled
  Resolved --> [*]
  Expired --> [*]
  Cancelled --> [*]
```

The workflow is Temporal code with durable timers (`waiting-on/.../workflow/FollowUpWorkflowImpl.java`). Replies arrive
by SMTP to a per-item address, by a provider webhook, or by paste; all three use one classification pipeline. If
Temporal loses a workflow, `FollowUpReconciler` restarts it at the item's real stage and original dates.

## 5. Deployment (Kubernetes)

```mermaid
flowchart TB
  subgraph ingress[Ingress, TLS]
    api[api.*] --> gw
    appHost[app.*] --> ws[workspace nginx]
    www[www.*] --> site[site nginx]
  end
  subgraph ns[Namespace: default-deny NetworkPolicy]
    gw[gateway x2] --> backends[9 backends + mcp-server]
    backends -.management port.-> mon[monitoring namespace<br/>Prometheus]
  end
  backends --> pg[(PostgreSQL + TimescaleDB + pgvector)]
  backends --> kf[(Kafka)]
  backends --> tp[(Temporal)]
  backends -.OTLP.-> otel[(collector)]
```

Pods run as non-root on read-only filesystems with all capabilities dropped; actuator lives on a private management
port that only the monitoring namespace may reach (ADR 0005). Chart: `deploy/helm/my-trove`; single-host alternative:
`deploy/compose/compose.yaml`.
