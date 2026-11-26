# 0004: Best-effort usage metering through Kafka

**Context.** Every request produces a usage event for analytics. Metering must never make a request slower or fail
it.

**Decision.** The gateway puts events in a bounded in-memory buffer and publishes them to `platform.usage.v1`;
platform-service consumes idempotently into a TimescaleDB hypertable with continuous aggregates. A full buffer drops
the oldest events.

**Consequences.** Analytics can undercount when Kafka is down for long; requests are unaffected (tested with Kafka
stopped). Usage figures for quotas are therefore approximate, which is why quota checks fail open.
