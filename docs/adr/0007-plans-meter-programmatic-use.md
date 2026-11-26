# 0007: Plans meter programmatic use, not people using the workspace

**Context.** Plans (FREE 120 requests a minute and 10,000 a month, PRO, DEVELOPER) were applied to every
authenticated caller. A live walk of the workspace on 2026-11-26 showed what that means: one page fans out to
several services (Today polls every product), so a signed-in FREE member clicking around was answered 429 within a
minute, and a normal month of use would exhaust 10,000 requests in days, locking a person out of their own records.

**Decision.** The gateway tells the two kinds of caller apart by the principal type it already has.
- API keys and consent clients (programmatic use): their plan's per-minute limit and monthly quota, unchanged.
- A person signed in to the workspace (principal type `USER`): a fair-use ceiling of
  `gateway.rate-limit.interactive-per-minute` (default 600), or their plan's per-minute limit if that is higher, and
  no monthly quota. The quota is not even looked up for them.
- Anonymous and passthrough callers: unchanged (FREE per-minute limit per client address).
Every request is still metered for analytics. The workspace's plan card now shows activity, not a quota, and says
the workspace is never limited by the plan.

**Consequences.** A stolen session can still make at most 600 requests a minute. Plans are now clearly a developer
product (limits on what apps and keys can do), which matches how API platforms bill. Tests: `RateLimitTest`
(interactive ceiling, no quota for people, plan limits for keys), `home.test.tsx` (plan card), `dev/e2e-phase1.sh`
and the k6 probe (800-request burst against the 600 ceiling).
