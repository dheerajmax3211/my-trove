# Wave 1 / W1: Waiting On + Consent, audit fixes and real logic
Scope: `waiting-on/**`, `consent-gateway/**`, `ui-common/apps/waiting-on/**`, `ui-common/apps/consent/**`, `sql-jooq/.../waiting_on*` and `.../consent*` migrations, dev/e2e scripts for these two.
Fix every item below, test as you go (backend unit + Testcontainers integration, frontend Vitest, and a live browser run as member@example.test on the dev stack):
1. Consent: GET /v1/owner/grants returned 500 once on a first home load. Find the cause (probably a null or an empty-state path), write a failing test, fix it.
2. Consent: duplicate React key warning on the owner home. Fix.
3. Waiting On: day counts say "(s)". Use correct pluralisation everywhere (backend letters and UI).
4. Waiting On: check snooze, cancel and the draft-letter wording in the browser; fix what is broken.
5. Waiting On: "reply by email" is not connected. Build the real path now: a reply the user pastes in (or forwards to a local inbound address that the notifications work in W3 will route) records the counterparty response on the item and updates the follow-up stage (paid, refused, more info requested). The stage logic must live in the backend with tests, not in the UI.
6. Waiting On follow-up logic: check that a Temporal-driven schedule (the existing Temporal workflow) really advances stages over time in a test with the time-skipping test environment: nudge, escalation, stop on resolve. Add the tests if missing.
7. Consent: the flow must be real end to end and each rule enforced in the backend: request, approve with narrowing, token scope enforcement (403 outside scope), expiry, revoke, audit chain verification. Add tests for expiry (time-skipping clock) and for narrowing never widening scope.
8. Visual: phone width (390px) and dark mode for every screen you touch. Read every screenshot you take.
9. Keep the existing e2e scripts passing (dev/e2e-waiting-consent-ask.sh, dev/e2e-waiting-consent-ask-ui.mjs).
