# Architecture decision records

Short records of decisions that shape the platform, written when they were made or reconstructed from the tracker's
decisions log (`docs/TRACKER.md`). Format: context, decision, consequences.

| ADR | Decision |
|---|---|
| [0001](0001-gateway-and-platform-token.md) | One gateway and a platform token, not library-only RBAC or a service mesh |
| [0002](0002-workspace-modules.md) | One workspace app hosting products as modules, not micro-frontends |
| [0003](0003-in-memory-rate-limits.md) | Rate limits in memory per gateway (Bucket4j), no Redis |
| [0004](0004-best-effort-usage-metering.md) | Usage events to Kafka are best effort and never block a request |
| [0005](0005-private-management-port.md) | Actuator on a private management port |
| [0006](0006-helm-without-bundled-infrastructure.md) | The Helm chart does not bundle databases or brokers |
| [0007](0007-plans-meter-programmatic-use.md) | Plans meter programmatic use; people in the workspace get a fair-use ceiling and no monthly quota |
