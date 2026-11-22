# Wave 2 / W6: product-wide QA (layout, responsive, dark, personas) and the shared shell
Scope: `ui-common/packages/ui/**` (shell and components, fix only what is broken), `ui-common/apps/workspace/**`, `ui-common/packages/admin-console/**`, and the standalone product shells. Do not change product business logic.
Known issues to fix first:
1. The standalone product layout overflows horizontally at 390px by about 92px and the top bar runs past the edge (Sign out clipped). Fix in the shared shell. Verify with a scrollWidth check on every product page at 390px.
2. Dark mode: black cards do not stand out on the dark theme. Pick a consistent card treatment for dark and fix it in the kit.
3. Admin console: never visually reviewed. Review every screen as the admin persona at 1440 and 390, light and dark. Read every screenshot, fix what looks broken or confusing.
4. Persona UX: as each persona (owner, admin, developer, member, auditor), walk the workspace; check the navigation is coherent, the forbidden pages say what is missing, and nothing shows a spinner forever.
5. Pages nobody has looked at: Family Treasury Members, Allowances, Statement; Digital Legacy Trustees, Policy, Timeline; Home Pulse Alerts and Reminders; Household Account and Admin. Check each at 390 and 1440, light and dark.
Method: a scripted browser pass (your own Playwright; do not use the shared MCP browser) that visits each route as the right persona, records scrollWidth, console errors, and takes screenshots; then read every screenshot. Store the script in `dev/qa/` and commit it so it can be rerun.
Test continuously: write the check first, then fix, commit on `w6/qa-shell`. Do not push.
