# 0006: The Helm chart does not bundle infrastructure

**Context.** The platform needs PostgreSQL with TimescaleDB and pgvector, Kafka and Temporal. Bundling them makes a
one-command demo but a poor production install (no backups, no upgrades, no HA).

**Decision.** The chart installs only My-Trove's own workloads and takes connection settings and a Secret as values.
`deploy/kind/infra.yaml` holds throwaway single-replica infrastructure for the CI smoke test only.

**Consequences.** A real install needs those services provisioned first (docs/deploy.md). The smoke test proves the
chart and images, not the operation of the infrastructure.
