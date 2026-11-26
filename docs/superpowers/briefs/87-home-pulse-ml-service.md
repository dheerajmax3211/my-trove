# 87: Home Pulse ML service (spec 4.D)

Read `80-common.md` first (it applies in full). Report: `docs/superpowers/briefs/87-report.md`.

Build `ml-service/`: a small Python service that learns each appliance's normal power pattern and flags anomalies,
which home-pulse calls with a fallback to its existing MAD rule. Read the spec section for 4.D
(`docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md`) and `home-pulse/README.md` (anomaly detection,
simulator, readings, continuous aggregates) first.

Rules for Python: nothing is installed on the host. Everything runs in Docker: a `ml-service/Dockerfile` on a pinned
`python:<3.12.x>-slim-<debian>` tag (check Docker Hub), dependencies pinned exactly in `requirements.txt` (FastAPI,
uvicorn, numpy, scikit-learn and/or statsmodels as you judge; nothing else heavy; check versions exist on PyPI), tests
with pytest run inside the image (`docker build --target test` or `docker run ... pytest`). Runs as non-root.

Model: per appliance, a seasonal baseline (hour-of-week profile with robust spread, or Holt-Winters if justified) for
a 24-hour forecast, and an anomaly score for a new reading window (e.g. IsolationForest on residual features, or a
calibrated residual z-score). Train from the readings home-pulse already stores (decide: home-pulse pushes history to
`POST /v1/models/{applianceId}/train`, or the service reads it; prefer home-pulse calling the service so the ML service
holds no database credentials). Endpoints: train, forecast, score, health, metrics (Prometheus text). Model state can
live in memory plus a volume file; say what happens on restart.

Integration in home-pulse (Java): an `AnomalyModel` seam with the current MAD implementation and an HTTP
implementation calling ml-service with a short timeout; any failure or a model not yet trained falls back to MAD and
the alert records which model decided (visible in the API and the UI's alert detail; update the UI copy and its demo
mock if the field is shown). Config `ML_SERVICE_URL` (empty = MAD only, the default outside dev). Tests: Java with a
stubbed ml-service (decision, fallback on timeout/500/untrained), Python unit tests (forecast shape, anomaly detected
on an injected fault from the simulator's patterns, normal week not flagged), and an evaluation script with published
numbers (precision/recall on injected faults vs MAD) in `ml-service/MODEL_CARD.md` (data, method, metrics, limits).

Wiring: `dev/up.sh` (start the container on :8095 if Docker is up and set ML_SERVICE_URL for home-pulse), compose,
Helm (optional, `mlService.enabled`), release workflow image matrix and a CI job running the Python tests in Docker,
NetworkPolicy (home-pulse -> ml-service only). Live check: if the dev stack is up, run home-pulse's simulator and show
an alert decided by the model; you may start a second home-pulse on a spare port against the same infrastructure but
never restart the shared ones.
