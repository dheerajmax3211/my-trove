# ml-service

Home Pulse's trained model: per appliance a seasonal (time-of-day) baseline, a 24-hour forecast and a calibrated
anomaly score for power shift and duty-cycle drift. Python 3.12 / FastAPI / numpy, port `8095`. home-pulse is its only
client and falls back to its built-in detector whenever this service does not answer. Method, numbers and limits:
[`MODEL_CARD.md`](MODEL_CARD.md).

**Python runs only in Docker**: nothing is installed on the host. `python:3.12.16-slim-trixie`, every package pinned
exactly (`requirements.txt`, `requirements-dev.txt`, transitive ones included), binary wheels only, non-root user 10001.

```bash
docker build -t my-trove/ml-service ml-service                      # runtime image (last stage)
docker build --target test -t my-trove/ml-service:test ml-service   # runs pytest while building (fails on a failing test)
docker run --rm my-trove/ml-service:test                            # runs the tests again
docker run --rm -p 127.0.0.1:8095:8095 -v my-trove-ml-models:/var/lib/ml-service my-trove/ml-service
ml-service/eval/run.sh                                              # the evaluation in MODEL_CARD.md
```

`dev/up.sh` builds and starts it as container `my-trove-ml-service` on `127.0.0.1:8095` when Docker is up, and sets
`ML_SERVICE_URL` for home-pulse (`ML_SERVICE=0` skips it); `dev/down.sh` stops it.

## API

All bodies JSON, snake_case. `{applianceId}` must be a UUID (it is also the model's file name).

| Method and path | Purpose |
| --- | --- |
| `POST /v1/models/{applianceId}/train` | `{appliance_type, window_start, window_end, samples:[{ts, watts}]}` (1-minute samples, max 5 weeks). `200` model summary, `422` too little data |
| `POST /v1/models/{applianceId}/score` | `{samples (last ~10 h), now, window_start?, live_features?}`. `200` per-feature decision (`on_power` -> POWER_SHIFT, `duty` and `cycle_minutes` -> DUTY_CYCLE_DRIFT: `evaluated`, `anomalous`, `statistic` (z), `threshold`, `score`, `observed`, `expected`, `change_pct`), `404 {"status":"untrained"}`, `409 {"status":"stale"}` when `window_start` differs from the trained window |
| `GET /v1/models/{applianceId}/forecast?hours=24&start=` | Hourly expected mean power with a p10..p90 band |
| `GET /v1/models/{applianceId}`, `DELETE /v1/models/{applianceId}` | Summary / forget |
| `GET /health` | `{"status":"UP","models":n,"persistent":bool}` |
| `GET /metrics` | Prometheus text: `ml_requests_total{endpoint,outcome}`, `ml_request_duration_seconds`, `ml_anomalies_total{kind}`, `ml_models` |

No authentication: the service must be reachable only by home-pulse (Helm NetworkPolicy `<release>-ml-service`,
the compose network without a published port, loopback in dev). It holds no database credentials and no readings,
only per-appliance profiles.

## State and restarts

Models live in memory and are mirrored to `MODEL_DIR` (`/var/lib/ml-service` in the image), one JSON file per
appliance, written atomically. On start every readable file is loaded (an unreadable one is skipped and logged).
With a volume a restart keeps every model; without one (or after a skipped file) the appliance answers `untrained`,
and home-pulse trains it again from the baseline's learning window on its next evaluation and decides with its
built-in detector until then. A re-learned baseline changes `window_start`, so the old model answers `stale` and is
retrained the same way.

## How home-pulse uses it

`com.personalplatform.homepulse.ml.MlAnomalyModel` (seam: `detect.AnomalyModel`), enabled by `ML_SERVICE_URL`:
the built-in detector always runs; ml-service then decides POWER_SHIFT and DUTY_CYCLE_DRIFT when it judged them.
Timeout (2 s by default), connection errors, 5xx, an unreadable answer, a feature it could not judge, or an
untrained model whose training fails (retried after 10 min) leave the built-in decision in place. Every alert records
`decidedBy` (`MAD` or `ML`), shown in the API and in the alert card.

## Tests (`docker build --target test`)

`tests/test_model.py`: training (threshold, slots, weekly profile, refusals), forecast shape and daily pattern,
five normal fridge weeks and five normal AC weeks never flagged, a 12% power step flagged within 12 h, a 1%/day AC ramp
flagged between 4% and 10% excess, home-pulse's simulator ANOMALY (stuck at 168 W) flagged, a refrigerant leak flagged
by run length, a 2-hour spike not flagged, hysteresis, too little data, serialisation round trip, run-length counting.
`tests/test_api.py`: the HTTP contract home-pulse relies on (404 untrained, 409 stale, 422 validation, UUID paths),
persistence across a restart with and without a volume, corrupt files skipped, metrics format.
