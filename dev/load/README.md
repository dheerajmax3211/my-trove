# Gateway load test (k6)

One script, `gateway.js`, with exactly two scenarios. There are no others.

| Scenario | What it does | What it proves |
|---|---|---|
| `steady` | 50 virtual users for 2 minutes. Each VU signs in as its own generated user (`loadtest-<vu>-<runid>@example.test`) at the dev identity provider, then reads `GET /api/auth/v1/me` and `GET /api/shared/v1/notifications/unread-count` through the gateway, at most 1 request per second per VU (sign-in included). | With 50 users under their limit, the gateway answers reads with p95 under 300 ms, under 1% failures, and rejects nobody (zero 429s). |
| `probe` | One fresh user (not any steady user) sends 800 requests in a burst to `/api/auth/v1/me`. | The rate limiter engages: at least one 429, every 429 carries `Retry-After`, and no 5xx. |

## Rate limit rule

Plans (FREE 120 requests per minute, gateway `PlanLimits.SEED`) limit API keys. A signed-in person gets the gateway's interactive ceiling of **600 requests per minute** and no monthly quota (ADR 0007). The steady scenario stays far under it: one request per second is at most 60 per minute per user. Load comes from many users, not from pushing one user over the limit. A 429 is expected behaviour, so it is excluded from `http_req_failed`; it is counted separately and asserted explicitly.

## Thresholds

- steady: `http_req_duration{endpoint:gateway}` p(95) < 300 ms; `http_req_failed` rate < 1%; `rate_limited_responses` count == 0.
- probe: `rate_limited_responses` count >= 1; `retry_after_on_429` rate == 1; `server_error_responses` count == 0; `http_req_failed` rate == 0 (catches timeouts, resets, 401, 5xx; each probe request has a 20s timeout).
- all: `server_error_responses` count == 0.

## Prerequisites

The stack must be up (`dev/up.sh`): gateway on `localhost:8080`, dev identity provider on `localhost:9100`.

The k6 image is pinned to `grafana/k6:1.8.3` (tag verified on Docker Hub, pulled with owner approval on 2026-11-24).

## Running

Run from the repo root. Results are written as JSON to `dev/load/results/<timestamp>.json` (git-ignored except `.gitkeep`). The script reads `BASE_URL` and `IDP_URL`; `RUN_ID` is optional.

macOS (Docker Desktop; `--network host` does not reach the host's localhost, so use `host.docker.internal`):

```bash
docker run --rm -v "$PWD/dev/load:/load" \
  -e BASE_URL=http://host.docker.internal:8080 \
  -e IDP_URL=http://host.docker.internal:9100 \
  grafana/k6:1.8.3 run /load/gateway.js
```

Linux:

```bash
docker run --rm --add-host host.docker.internal:host-gateway -v "$PWD/dev/load:/load" \
  -e BASE_URL=http://host.docker.internal:8080 \
  -e IDP_URL=http://host.docker.internal:9100 \
  grafana/k6:1.8.3 run /load/gateway.js
```

With no `SCENARIO`, both scenarios run in one go: the probe has `startTime` 2m30s, after steady ends. To run one alone, add `-e SCENARIO=steady` or `-e SCENARIO=probe` (the chosen scenario then starts at 0s). Any other `SCENARIO` value aborts with an error. Do not use `--vus`/`--duration`; they override the scenarios.

The gateway's rate-limit buckets are in memory and fixed-window. If you re-run the probe within a minute using the same `RUN_ID`, the user's bucket is already empty; by default `RUN_ID` is the start time, so every run uses fresh users.
