# 0003: Rate limits in memory per gateway

**Context.** Plans set requests per minute (FREE 120, PRO 600, DEVELOPER 1,200) and a monthly quota. The project's
cost ceiling is zero.

**Decision.** Bucket4j token buckets in the gateway's memory. Monthly quota figures come from platform-service in the
background and fail open when stale. No Redis.

**Consequences.** Correct for one gateway replica. With N replicas a user can reach up to N times the per-minute
limit; the chart's default of two replicas makes that 2x. The fix, if it matters, is a shared bucket store (Redis or
Postgres) behind the same interface.
