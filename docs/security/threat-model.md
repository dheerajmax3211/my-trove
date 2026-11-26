# Threat model

Scope: the deployed platform (gateway, nine backend services, workspace, public site) as installed by the Helm chart.
Method: STRIDE per trust boundary. Each row names the control that exists today and where it is tested. "Gap" rows
are known and not yet fixed.

## Assets

Personal records in every product (follow-ups, notes, receipts, ledgers, appliance data), the Digital Legacy vault
(ciphertext only; the server never sees plaintext), token-signing keys (auth and consent), consent grants and their
audit chain, uploaded files, and usage data.

## Trust boundaries

1. Internet → Ingress → gateway, workspace, site.
2. Gateway → backend services (cluster network).
3. Third-party apps → consent endpoints (OAuth-style tokens consent issues).
4. Services → PostgreSQL, Kafka, Temporal, SMTP, OTLP collector.
5. Operators → Kubernetes, Secrets, management ports.

## Threats and controls

| # | Boundary | STRIDE | Threat | Control | Evidence |
|---|---|---|---|---|---|
| 1 | 1 | Spoofing | Forged or replayed sign-in | Firebase ID token verified, then exchanged at auth for a short-lived platform token (RS256, JWKS, `permissions_version`) | auth tests, `dev/e2e-phase1.sh` |
| 2 | 1 | Elevation | Member calls an admin API | Permissions in the platform token, checked at the gateway route and again by `@PreAuthorize` in the service | `AdminApiTest` permission matrix (27 cases) |
| 3 | 1 | Denial of service | One user floods the API | Per-plan rate limit (Bucket4j) and monthly quota at the gateway, 429 with `Retry-After` | k6 probe: 80/80 429s carried `Retry-After`, 0 5xx |
| 4 | 1 | Info disclosure | Actuator or internal endpoints reachable from outside | Actuator only on a private management port (startup guard refuses equal or blank ports); `/internal/**` and `/actuator/**` blocked at the gateway; NetworkPolicy limits management ports to the monitoring namespace | `ObservabilityExposureTest` (every service), `ManagementPortGuardTest`, kind smoke check 3 |
| 5 | 2 | Spoofing | A pod inside the cluster calls a backend directly with no token | Every backend verifies the platform token itself (no trust in network position); NetworkPolicy admits backend ports only from other backends | service security tests |
| 6 | 2 | Tampering | Internal calls between the gateway and platform-service forged | Shared `APP_INTERNAL_API_KEY`, kept in a Secret | platform-service tests |
| 7 | 3 | Elevation | A third-party app widens its access | Consent grants are scoped and revocable; approval can narrow requested hours, never widen; hash-chained audit log you can verify | consent tests (`TokenIssuerTest`, audit chain tests) |
| 8 | 3 | Repudiation | A grant or data access is denied later | Tamper-evident (hash-chained) consent audit log; admin actions audited in auth | consent and auth audit tests |
| 9 | 4 | Info disclosure | Secrets leak into traces or logs | Gateway spans keep the path only, never the query (signed download tokens, OAuth parameters); trace sampling 0.1 | `TraceTagsTest` |
| 10 | 4 | Info disclosure | Cross-user reads in search | Row-level security in ask-your-life (`ask_life_app` role, policies per user) | ask-your-life isolation tests |
| 11 | 4 | Tampering | Ledger corrupted by concurrent writes | Double-entry invariants enforced in the database, idempotency keys | family-treasury tests |
| 12 | 4 | Info disclosure | Database dump exposes signing keys | Signing keys encrypted at rest with a 32-byte key-encryption key held only in a Secret | `KeyCipher` tests |
| 13 | 1 | Tampering | Clickjacking or content sniffing on the web apps | nginx sends `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a permissions policy; ZAP baseline fails CI if the first two go missing | `deploy/zap/rules.tsv` |
| 14 | 5 | Elevation | A compromised container escalates | Non-root users, read-only root filesystem, all capabilities dropped, no service-account token mounted, seccomp RuntimeDefault | chart templates, kubeconform |
| 15 | supply chain | Tampering | A vulnerable or malicious dependency ships | Trivy blocks fixable HIGH and CRITICAL findings; CycloneDX SBOM per image; Dependabot for Maven, npm, Actions and Docker; base images pinned to exact tags | `release.yml` |

## Known gaps

- **No Content-Security-Policy** on the web apps yet; ZAP reports it as a warning. Next step: a CSP that allows the
  Firebase auth domains and the API origin.
- **Rate limits are per gateway replica** (in memory), so N replicas allow up to N times the plan limit (ADR 0003).
- **Management ports are open inside the pod network** to the monitoring namespace with no authentication. Metrics
  hold no personal data (labels use route templates, never ids: tested), but they do reveal traffic shape.
- **Key-encryption keys cannot be rotated** without re-encrypting stored signing keys; there is no tool for that yet.
- **Dev defaults remain in application config** (for example a `platform` database password default). The chart
  always sets these from values and the Secret, so they never apply in a chart install, but a bare `java -jar`
  outside the chart would fall back to them.
- **No WAF and no bot protection** in front of the ingress.
