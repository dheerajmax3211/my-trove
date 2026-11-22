# Wave 2 / W5: Home Pulse and Ask Your Life, move logic into the services
Scope: `home-pulse/**`, `ask-your-life/**`, their migrations, `ui-common/apps/home-pulse/**`, `ui-common/apps/ask-your-life/**`, dev scripts for these two.
Principle: business logic belongs in the Java services with tests; the UI renders what the API returns. Remove any logic in the mock backends that the service should own, where it is simple to do so.
Home Pulse:
1. Energy and health logic exists (baseline learning, anomaly detection, manual meter totals, CSV import, simulator). Check each against its tests and fix gaps: a manual total for a device with a gap must not invent readings; a CSV with a bad row must reject only that line or the whole file, as documented; the simulator never mixes with real history.
2. CSV import: accept more than timestamp,watts (watts or kWh, optional voltage/amps, timezone-aware timestamps with a clear error when the zone is missing).
3. Reminders are derived in the backend from the warranty and service dates and alerts: add the "source" to each reminder (already partly done) and test it.
4. Demo mock: remove logic from `ui-common/apps/home-pulse/src/mock` that duplicates the service (baseline, derivation) where the UI can simply render API results. Keep the demo working.
Ask Your Life:
5. Hybrid search (full-text plus vector, RRF fusion, RLS) is implemented in Java: confirm with tests, including that a user never sees another user's passages (RLS test with two users).
6. The embedder is a deterministic local stand-in. Keep it as the default, but make the provider pluggable and tested: a real embedding model through the existing HTTP embedder adapter (EMBEDDER_URL), with a test double server. Do not install a model yet (that waits for the owner's yes); document how to point EMBEDDER_URL at Ollama when it is available.
7. Ingestion: check the worker retries and failure states (documents shown as failed in the library, with a reason), and that deleting a document removes its passages from search.
Verify live as member@example.test: add a note, see it indexed, search it, delete it, confirm it is gone from search. Read every screenshot you take; check 390px and dark mode for every page you touch.
Test continuously: failing test first, then fix, commit on `w5/homepulse-askyourlife`. Do not push.
