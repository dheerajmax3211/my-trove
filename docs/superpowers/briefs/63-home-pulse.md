# Audit: Home Pulse, energy data and reminders (branch `audit/home-pulse`)
Scope: `ui-common/apps/home-pulse/**`, `home-pulse/**`, `sql-jooq/.../home_pulse*` (migrations only if needed).
The owner's question, answer it honestly in the product: "Where is the energy consumption coming from? I cannot connect anything, so how does it calculate?" The truth today: energy numbers come only from a smart plug or meter that posts readings with its device token, or from the built-in simulator, which generates fake data. Without one of those there is no energy data at all. Reminders come only from the warranty and service dates the user types in. Alerts come only from readings.
Decide and build, from a product perspective:
1. Honest explanation everywhere energy appears: where the numbers come from, and when it says "Simulated", that they are simulated numbers, not the appliance's.
2. A real path to real data without expensive hardware. Evaluate: (a) a manual reading entry ("I read the meter now"), (b) a CSV import from a smart-meter or plug export, (c) a Home Assistant / Tasmota / Shelly integration guide with the real endpoint. Pick the best one or two, justify in your report, and build them end to end (with tests). Do not invent a device integration you cannot run.
3. The simulator stays, clearly labelled, and must never mix with real readings for the same appliance (check it).
4. Reminders: show where each reminder comes from (service due date, warranty end, alert), so the owner understands them.
5. Verify live as the member persona: add an appliance, add a reading (real path you built), see the chart, health and reminders update. Screenshot, read, and fix.
