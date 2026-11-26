# 81: Move derived logic from the browser to the services

Read `80-common.md` first. Report: `docs/superpowers/briefs/81-report.md`.

Problem: some product UIs compute things the backend owns, so the UI and the server can disagree. Proven case:
Waiting On's `ui-common/apps/waiting-on/src/features/items/logic/schedule.ts` (`estimateNextStep`, `nextFollowUp`)
guesses the follow-up schedule from `createdAt + plan days`, while the real schedule lives in the Temporal workflow
(`waiting-on/.../workflow/FollowUpWorkflowImpl.java`, which already has a `state()` query returning stage and
next action time, and `FollowUpScheduler.state(itemId)`).

Do:
1. Audit every product app under `ui-common/apps/*/src` (waiting-on, consent, home-pulse, ask-your-life,
   digital-legacy, family-treasury, hub) and `packages/admin-console` for business logic computed client-side that
   the server should own: schedules, statuses derived from dates, totals/balances, counts, health/state
   classifications, permissions decisions, money arithmetic. Write the audit as a table in your report (file,
   what it computes, server-owned or legitimately client-side, action). Legitimately client-side and must stay:
   Digital Legacy's end-to-end crypto (Shamir, AES-GCM, key files) and pure presentation (formatting, sorting a
   list already fetched, grouping for display).
2. For each server-owned computation (start with Waiting On's next step; do at least the clear cases, ranked by
   how wrong a disagreement would look to a user): add the value to the service's API response (or a small
   endpoint), computed from the source of truth (for Waiting On: the workflow state when Temporal answers, falling
   back to the stored plan when it does not, and saying which in the response), with backend tests. Then make the
   UI display the server's value and delete the client-side computation and its tests (replace them with UI tests
   that render the server value). Keep the module's demo mode working: its mock API (`src/mock/`) must return the
   same new fields, computed there (the mock is the demo backend; that duplication is accepted for now).
3. Keep every existing test green in the modules you touch (backend module suites, and `pnpm test` for the apps).

Out of scope: deleting standalone app shells (another workstream does that next), MCP, inbound email, embeddings.
