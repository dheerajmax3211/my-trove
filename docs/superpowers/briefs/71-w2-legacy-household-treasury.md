# Wave 2 / W2: Digital Legacy, Household, Family Treasury, audit fixes and real logic
Scope: `digital-legacy/**`, `family-treasury/**`, `shared-service/**`, `ui-common/apps/digital-legacy/**`, `ui-common/apps/family-treasury/**`, `ui-common/apps/hub/**`, `sql-jooq/.../legacy*`, `.../treasury*`, `.../shared*` migrations, and their dev/e2e scripts.
Fix every item, testing as you go (backend unit + Testcontainers, time-skipping tests where time matters, frontend Vitest, live browser runs as the right persona):
1. Digital Legacy: vault endpoints return 404 when no vault exists. That is a normal state: return a 200 "no vault" state from the API (or handle 404 as the empty state consistently) and remove the console errors. Test it.
2. Digital Legacy: the state ladder past "You are here" (grace, reminders, trustees decide, released) is untested. Add time-skipping backend tests that miss check-ins and assert each rung transition, the reminders sent (through the notification interface; W3 provides it, until then assert the call), and the release condition with trustee quorum. Then check the UI shows each state.
3. Digital Legacy: keys must stay in the browser; re-verify the invariant (no key material in storage, cookies, logs or API payloads) with a test.
4. Family Treasury: invites are code-only. Keep codes, and add the email invite path once W3's notification interface exists (leave a clear TODO-free seam: an `InvitationNotifier` that W3 implements; test the call).
5. Family Treasury: the approval logic (limit, approver must differ from requester, expiry of pending approvals, reject) must be enforced in the backend with tests; check the dashboard shows exactly the pending items for each role.
6. Household: check reminders and files flows end to end for two members (sharing visibility rules enforced in the backend, tested: a non-member never sees a household's files or reminders).
7. Visual: phone width (390px) and dark mode for every screen you touch. Read every screenshot. Check the Trustees page, Policy, Timeline, Members and Allowances pages which no one has looked at yet.
8. Keep the existing audit scripts (dev/audit/*.mjs) passing.
