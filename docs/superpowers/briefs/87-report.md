# 87 report: Home Pulse ML service (spec 4.D)

Status: **DONE_WITH_CONCERNS** (the concerns: frontend checks not run in this worktree; CI and release jobs not run
because nothing is pushed; all model numbers come from simulated data).
Branch: `worktree-agent-a96bf6361cb1dc274` (based on main `4bd91de`).

## What was built

**`ml-service/`** (Python 3.12, FastAPI, numpy only; runs only in Docker)
* `Dockerfile`: `python:3.12.16-slim-trixie` (checked on Docker Hub, amd64 + arm64), stages `base` / `test` / `runtime`.
  Binary wheels only, non-root uid 10001, `MODEL_DIR=/var/lib/ml-service`, healthcheck. `docker build --target test`
  runs pytest during the build.
* `requirements.txt` / `requirements-dev.txt`: every package pinned exactly, transitive ones too (from `pip freeze` in
  the image). I checked each version on PyPI and moved to releases at least two weeks old where the newest was
  younger (fastapi 0.162.5, numpy 2.5.4, pydantic 2.14.2, annotated-doc 0.0.5, certifi 2026.10.23, packaging 26.3).
  scikit-learn and statsmodels are not used: see "Decisions".
* `app/model.py`: the model `seasonal-robust-z/1`. Pure and deterministic.
  1. Learns an ON/OFF threshold.
  2. Measures window features over the 6 hours before each full hour: duty, median ON power, mean completed-run length.
  3. Keeps a seasonal profile per end-hour slot: hour of day, or hour of week once training spans 3 weeks. Each slot
     is pooled with its neighbours.
  4. Uses a robust z on the residuals, with a threshold calibrated on the training windows: `max(4, 1.25 x the worst
     training |z|)`.
  5. An alert needs the newest 3 hourly windows to agree. Live features get 70% hysteresis.
  6. ACs are judged on power only. The forecast is the hourly mean-power profile with a p10..p90 band.
* `app/main.py`: endpoints `POST /v1/models/{id}/train`, `POST .../score`, `GET .../forecast`, `GET`/`DELETE
  /v1/models/{id}`, `GET /health`, `GET /metrics` (Prometheus text). The ID must be a UUID, which also guards the
  file path.
  * `404 untrained` when there is no model.
  * `409 stale` when the training window differs.
  * `422` on validation errors or too little data.
* `app/store.py`: models live in memory and are mirrored to one JSON file per appliance in `MODEL_DIR`, written
  atomically. All files are loaded on start; corrupt files are skipped.
* `app/metrics.py`: hand-rolled Prometheus counters.
* `MODEL_CARD.md` (data, method, metrics, limits), `README.md`.
* `eval/run.sh` and `eval/evaluate.py`: the evaluation (see Tests). Output goes to `ml-service/eval/out/`, which is
  gitignored.

**home-pulse (Java)**
* `detect/AnomalyModel` seam (`Input` record), `detect/MadAnomalyModel` (the existing detector), `detect/DecidedBy`.
  `Finding` gained `decidedBy`; the old 4-argument constructor defaults it to MAD.
* `ml/MlClient`, `ml/MlServiceClient` (RestClient + JDK client; 2 s score timeout, 30 s train timeout).
* `ml/MlAnomalyModel` decides as follows:
  * The built-in detector always runs.
  * ml-service decides POWER_SHIFT / DUTY_CYCLE_DRIFT when it judged them.
  * Everything else falls back to MAD: timeout, connection error, 5xx, an unreadable answer, a feature it could not
    judge, learning, NO_DATA.
  * An untrained or stale model is trained from the baseline's learning window, then scored again. A failed training
    is retried after 10 minutes.
  * Counter `homepulse.ml.evaluations{outcome}`. A WARN is logged once per outage.
* `ml/AnomalyModelConfig`: `ML_SERVICE_URL` empty means MAD only (the default). `HomePulseProperties.Ml` and
  `app.ml.*` hold the settings. `EvaluationService` now calls the seam.
* Alerts: migration `sql-jooq/.../home_pulse/V4__alert_decided_by.sql` adds `decided_by text not null default
  'MAD'` with a check constraint; refresh updates it. `AlertRepository`, `Alert` and `AlertResponse.decidedBy` carry
  it into the API.

**UI** (`ui-common/apps/home-pulse`)
* `AlertDto.decidedBy?` and the alert card line "Detected by the learned model ..." / "Detected by the built-in rules ...".
* `describeAlert` understands the ML evidence (`hoursSustained`).
* Demo mock: `decidedBy` defaults to MAD; seeded alert 201 is now ML-decided with ML evidence.
* Tests updated or added: `evidence.test.ts`, `flows/alerts.test.tsx`.

**Wiring**
* `dev/up.sh`: when Docker is up (and `ML_SERVICE` is not 0), it builds and starts container `my-trove-ml-service` on
  `127.0.0.1:8095` with volume `my-trove-ml-models`, then sets `ML_SERVICE_URL` for home-pulse.
* `dev/down.sh` stops that container.
* `deploy/compose/compose.yaml`: `ml-service` service (read-only, caps dropped, no published port, `mlmodels`
  volume); home-pulse gets `ML_SERVICE_URL`.
* Helm:
  * `mlService.*` values, off by default. `templates/ml-service.yaml` holds the Deployment and Service (component
    `ml`, not `backend`, so the backends policy does not open it).
  * home-pulse gets `ML_SERVICE_URL` when the service is enabled.
  * NetworkPolicy `<release>-ml-service`: home-pulse may call it, and the monitoring namespace may scrape it.
* `.github/workflows/ci.yml`: job `ml-service` runs the test stage build, then the runtime image build.
  `release.yml`: matrix entry `ml-service` (kind `python`) builds `ml-service/` and goes through the same Trivy, SBOM
  and push steps.
* Docs: root README module list, `home-pulse/README.md` (seam, config, tests, limits), `docs/TRACKER.md` 4.D ticked.

## Tests and results

* **Python** (`docker build --target test`, inside `python:3.12.16-slim-trixie`): **40 passed**.
  * `test_model.py`:
    * forecast shape: 24 hourly points, band ordered, follows the daily pattern
    * 5 normal fridge weeks and 5 normal AC weeks never flagged
    * a 12% step flagged within 12 h
    * a 1%/day ramp flagged between 4% and 10% excess
    * home-pulse's simulator ANOMALY (168 W stuck on) flagged
    * a refrigerant leak flagged by run length
    * a 2-hour spike not flagged
    * hysteresis, too little data, serialisation round trip, run counting
  * `test_api.py`: the contract, persistence with and without a volume, corrupt files skipped, metrics.
* **Java**: `./mvnw -B -ntp -pl sql-jooq,home-pulse -am verify` passes.
  * platform-sql: 76 tests, 0 failures. One new test is the V4 column and constraint check; the migration-order test
    was updated for V4.
  * platform-security: 45 tests, 0 failures.
  * home-pulse: 198 tests, 0 failures, 1 skipped (the opt-in export).
  * New home-pulse tests: `ml/MlAnomalyModelTest` (13 tests, real HTTP stub). It covers: ML decision with evidence,
    ML-normal overriding MAD, a not-evaluated kind keeping MAD, the hysteresis request, fallback on 500 / timeout /
    refused connection / unreadable answer, untrained → train → score, stale → retrain, failed-training backoff,
    and no call while learning or on NO_DATA.
  * `MlServiceIntegrationTest` (2 tests, own Spring context): API `decidedBy` = ML for POWER_SHIFT and MAD for
    STUCK_ON; a 500 leads to MAD only.
  * `SimulationApiTest` now also asserts `decidedBy` = MAD without ML.
* **Evaluation** (`ml-service/eval/run.sh`):
  * Setup: the Java simulator plus a replay of the real MAD detector and reconciler in `MlEvaluationExportTest`,
    then the Python replay of the ML model with the same alert lifecycle.
  * Data: 9 scenarios. Tuned on seeds 101-103, frozen, then reported on the held-out seeds 1-10 (90 episodes,
    460 healthy appliance-days).
  * Result: **ML precision 0.982 / recall 0.786 vs MAD 1.000 / 0.571.**
    * ML catches power ramps at about 8% excess instead of about 11%, roughly 2.5 days earlier.
    * Steps are caught after 6-10 h instead of 16-21 h.
    * ML catches the refrigerant leak in 10 of 10 episodes; MAD catches it in 0 of 10 within 14 days.
    * A 7% step is mostly missed by both (ML 5 of 20, MAD 0 of 20).
    * ML raised 1 false DUTY_CYCLE_DRIFT (healthy fridge, seed 9).
  * Full tables are in `MODEL_CARD.md`.
* **Live check** (dev stack was up; no shared service restarted):
  * Setup: ran the runtime image as `my-trove-ml-service` with `--read-only`, caps dropped, the volume, and uid 10001
    confirmed. Started a second home-pulse from this branch on :8185 / :9185 against the shared Postgres, in a
    **scratch database `trove_ml_check`**. A separate database was needed because this branch's V4 migration would
    otherwise be recorded in the shared `home_pulse` history: main's home-pulse would then fail Flyway validation on
    its next restart until this branch is merged.
  * Ran the simulator with ANOMALY on a fridge. Flow: score 404 → train 200 → score 200. Alerts:
    * `POWER_SHIFT CRITICAL decidedBy=ML` ("27% higher than the learned normal for this time of day (167 W vs 131 W)",
      z 13.5 / threshold 4.0)
    * `DUTY_CYCLE_DRIFT CRITICAL ML`
    * `STUCK_ON CRITICAL MAD`
  * Then stopped ml-service and re-ran: only `STUCK_ON` (MAD), the WARN "ml-service unavailable" logged, and the
    request still completed in 0.3 s.
  * Restarted the container: `models: 1`, so the model was kept on the volume.
  * Cleanup: stopped the second home-pulse, dropped the scratch database, removed the container and volume.

## Not done or not verified

* **Frontend checks not run:** no `pnpm install` in worktrees. `pnpm lint && pnpm typecheck && pnpm test` still need
  to run for the changed files: `features/alerts/{types,evidence,evidence.test}.ts`,
  `features/alerts/components/AlertCard.tsx`, `flows/alerts.test.tsx`, `mock/{types,mockApi,seed}.ts`.
* **CI and release changes not run in GitHub Actions** (nothing pushed).
* `dev/up.sh` was not executed end to end: I ran the same container command by hand, and `bash -n` passes for both
  scripts.
* **Helm:** `helm lint` passes and `helm template` renders with `mlService.enabled=true` and false (no ml-service
  objects when off). It was not deployed to kind, and the kind smoke test does not enable it.
* Compose file edited but `docker compose up` of the full single-host stack was not run.
* No real appliance data anywhere. Water pump, washing machine and "other" were not evaluated.
* The forecast endpoint exists and is tested, but home-pulse does not call it yet. Nothing in the UI shows a forecast.

## Decisions and why

* **numpy only, no scikit-learn / statsmodels.** One learning week gives 7 values per hour-of-day slot.
  * Holt-Winters needs several seasons to fit.
  * An isolation forest gives an unexplainable score.
  * A per-slot robust median with residual calibration explains itself ("27% more than normal for this time of day")
    and keeps the image small.
* **home-pulse pushes the history** (`train`): ml-service holds no database credentials. Training is lazy: it happens
  on the first `untrained` or `stale` answer, followed by an immediate re-score, so restarts without a volume heal
  themselves.
* **Which kinds ML decides:** only POWER_SHIFT and DUTY_CYCLE_DRIFT. The run-length and silence rules stay in the
  built-in detector in both paths. `decidedBy` is per finding, so one appliance can have ML and MAD alerts side by
  side.
* **ACs are judged on power only.** On the tuning seeds, AC duty raised 5 false alerts on hot days, because the model
  does not see the weather. The built-in detector keeps judging AC duty with its 60% tolerance.
* **Added a `cycle_minutes` feature**, because duty alone did not reveal the refrigerant leak on the simulator.
* **Port 8095** as the brief says. The spec table says 8091; the brief wins.
* `MlEvaluationExportTest` is opt-in (`-Dml.eval.out`), so normal `verify` does not write 17 MB of episodes.
* **Files outside the module directories:** `sql-jooq` (migration V4 and its schema test), `.gitignore`
  (`ml-service/eval/out/`), root `README.md`, `docs/TRACKER.md`, the workflows, deploy and dev scripts. All are in the
  brief's scope or required by it.
* **Merge note:** V4 is a plain migration added after V100-V102. `spring.flyway.out-of-order=true` (already set)
  applies it on existing databases.

## Commits

```
d02353d feat(home-pulse): AnomalyModel seam with ml-service client and MAD fallback
124f083 test(home-pulse): ml-service path end to end against a stub, decidedBy in the API
0da1899 feat(ml-service): seasonal baseline + calibrated residual z-score service for Home Pulse
3374eb0 build(ml-service): dev/up.sh container on :8095, compose, optional Helm deployment, NetworkPolicy, CI and release
da79b44 feat(home-pulse-ui): alert detail says which model decided; demo mock seeds an ML-decided alert
fdd6b6e test(sql-jooq): home_pulse V4 decided_by column and its check constraint
ea92839 docs(ml-service): model card with held-out simulator numbers, README, home-pulse README and tracker
(+ this report)
```
