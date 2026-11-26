"""HTTP API. home-pulse is the only client: it pushes training history and recent minute samples, so this service
holds no database credentials and no owner data beyond per-appliance aggregate profiles.

    POST /v1/models/{applianceId}/train     learn the seasonal baseline from minute samples
    POST /v1/models/{applianceId}/score     judge the newest hours: per-feature anomaly decision and score
    GET  /v1/models/{applianceId}/forecast  expected power for the next N hours (default 24)
    GET  /v1/models/{applianceId}           model summary
    DELETE /v1/models/{applianceId}         forget the model
    GET  /health                            liveness/readiness
    GET  /metrics                           Prometheus text format
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field

from .metrics import Metrics
from .model import APPLIANCE_TYPES, FEATURES, ApplianceModel, InsufficientData
from .store import ModelStore

LOG = logging.getLogger("ml_service")

MAX_TRAIN_SAMPLES = 60 * 24 * 35      # five weeks of minute samples
MAX_SCORE_SAMPLES = 60 * 48

ApplianceType = Literal[APPLIANCE_TYPES]  # type: ignore[valid-type]
Feature = Literal[FEATURES]  # type: ignore[valid-type]


class Sample(BaseModel):
    ts: datetime
    watts: float = Field(ge=0, le=100_000)


class TrainRequest(BaseModel):
    appliance_type: ApplianceType
    window_start: datetime
    window_end: datetime
    samples: list[Sample] = Field(max_length=MAX_TRAIN_SAMPLES)


class ScoreRequest(BaseModel):
    samples: list[Sample] = Field(max_length=MAX_SCORE_SAMPLES)
    now: datetime | None = None
    # the training window home-pulse believes the model was trained on; a different one means "stale"
    window_start: datetime | None = None
    live_features: list[Feature] = Field(default_factory=list)


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _pairs(samples: list[Sample]) -> list[tuple[float, float]]:
    return [(s.ts.timestamp() if s.ts.tzinfo else s.ts.replace(tzinfo=timezone.utc).timestamp(), s.watts)
            for s in samples]


def _summary(appliance_id: uuid.UUID, m: ApplianceModel) -> dict:
    return {
        "appliance_id": str(appliance_id),
        "model_version": m.version,
        "appliance_type": m.appliance_type,
        "profile": "hour_of_week" if m.period == 168 else "hour_of_day",
        "switching": m.switching,
        "on_threshold_watts": None if m.threshold == float("-inf") else round(m.threshold, 2),
        "thresholds": {k: round(v, 3) for k, v in m.thresholds.items()},
        "hours_used": m.hours_used,
        "window_start": m.window_start,
        "window_end": m.window_end,
        "trained_at": m.trained_at,
    }


def _untrained(appliance_id: uuid.UUID) -> JSONResponse:
    return JSONResponse(status_code=404, content={"status": "untrained", "appliance_id": str(appliance_id)})


def create_app(model_dir: str | None = None) -> FastAPI:
    store = ModelStore(model_dir)
    metrics = Metrics()
    app = FastAPI(title="Home Pulse ML service", version="1", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store

    @app.middleware("http")
    async def observe(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        endpoint = getattr(route, "name", None) or "unmatched"
        if endpoint not in ("metrics", "health"):
            metrics.observe(endpoint, str(response.status_code), time.perf_counter() - started)
        return response

    @app.get("/health", name="health")
    def health():
        return {"status": "UP", "models": len(store), "persistent": store.persistent}

    @app.get("/metrics", name="metrics", response_class=PlainTextResponse)
    def prometheus():
        return PlainTextResponse(metrics.render(len(store)), media_type="text/plain; version=0.0.4")

    @app.post("/v1/models/{appliance_id}/train", name="train")
    def train(appliance_id: uuid.UUID, body: TrainRequest):
        try:
            model = ApplianceModel.train(_pairs(body.samples), body.appliance_type)
        except InsufficientData as e:
            return JSONResponse(status_code=422, content={"status": "insufficient_data", "detail": str(e)})
        model.window_start = _iso(body.window_start)
        model.window_end = _iso(body.window_end)
        model.trained_at = _iso(datetime.now(timezone.utc))
        store.put(appliance_id, model)
        LOG.info("trained %s (%s): %d hours, thresholds %s", appliance_id, body.appliance_type,
                 model.hours_used, model.thresholds)
        return _summary(appliance_id, model)

    @app.post("/v1/models/{appliance_id}/score", name="score")
    def score(appliance_id: uuid.UUID, body: ScoreRequest):
        model = store.get(appliance_id)
        if model is None:
            return _untrained(appliance_id)
        if body.window_start is not None and model.window_start != _iso(body.window_start):
            return JSONResponse(status_code=409, content={"status": "stale", "trained_window_start": model.window_start})
        now_s = None if body.now is None else _pairs([Sample(ts=body.now, watts=0)])[0][0]
        result = model.score(_pairs(body.samples), now_s, body.live_features)
        for f in result["features"]:
            if f["anomalous"]:
                metrics.anomaly(f["kind"])
        result["status"] = "ok"
        result["model_version"] = model.version
        result["trained_at"] = model.trained_at
        result["window_end"] = _iso(datetime.fromtimestamp(result["window_end"], timezone.utc))
        return result

    @app.get("/v1/models/{appliance_id}/forecast", name="forecast")
    def forecast(appliance_id: uuid.UUID, hours: int = Query(24, ge=1, le=168), start: datetime | None = None):
        model = store.get(appliance_id)
        if model is None:
            return _untrained(appliance_id)
        start_s = (start or datetime.now(timezone.utc))
        start_s = start_s if start_s.tzinfo else start_s.replace(tzinfo=timezone.utc)
        points = model.forecast(start_s.timestamp(), hours)
        for p in points:
            p["ts"] = _iso(datetime.fromtimestamp(p["ts"], timezone.utc))
        return {"appliance_id": str(appliance_id), "model_version": model.version, "hours": hours, "points": points}

    @app.get("/v1/models/{appliance_id}", name="model")
    def describe(appliance_id: uuid.UUID):
        model = store.get(appliance_id)
        return _untrained(appliance_id) if model is None else _summary(appliance_id, model)

    @app.delete("/v1/models/{appliance_id}", name="delete", status_code=204)
    def delete(appliance_id: uuid.UUID):
        store.delete(appliance_id)
        return Response(status_code=204)

    return app


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
app = create_app(os.environ.get("MODEL_DIR") or None)
