"""HTTP contract (what home-pulse's MlServiceClient relies on), persistence and metrics."""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests import sim

T0 = 1_930_000_000 - (1_930_000_000 % sim.DAY)
D, H = sim.DAY, 3600
APPLIANCE = uuid.UUID("00000000-0000-4000-8000-000000000001")


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat().replace("+00:00", "Z")


def wire(samples):
    return [{"ts": iso(t), "watts": round(w, 2)} for t, w in samples]


DATA = sim.fridge(T0, 9, 1)
TRAIN = {"appliance_type": "FRIDGE", "window_start": iso(T0), "window_end": iso(T0 + 7 * D),
         "samples": wire(sim.between(DATA, T0, T0 + 7 * D))}


def score_body(now, **extra):
    return {"samples": wire(sim.between(DATA, now - 10 * H, now)), "now": iso(now), **extra}


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(str(tmp_path)))


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "UP", "models": 0, "persistent": True}


def test_untrained_appliance_is_404_with_a_status(client):
    r = client.post(f"/v1/models/{APPLIANCE}/score", json=score_body(T0 + 8 * D))
    assert r.status_code == 404 and r.json()["status"] == "untrained"
    assert client.get(f"/v1/models/{APPLIANCE}/forecast").status_code == 404


def test_train_score_forecast(client):
    r = client.post(f"/v1/models/{APPLIANCE}/train", json=TRAIN)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["model_version"] == "seasonal-robust-z/1"
    assert body["profile"] == "hour_of_day" and body["window_start"] == iso(T0)

    s = client.post(f"/v1/models/{APPLIANCE}/score", json=score_body(T0 + 8 * D, window_start=iso(T0)))
    assert s.status_code == 200, s.text
    out = s.json()
    assert out["status"] == "ok" and out["evaluated"] and not out["anomalous"]
    assert {f["name"] for f in out["features"]} == {"on_power", "duty", "cycle_minutes"}
    assert {f["kind"] for f in out["features"]} == {"POWER_SHIFT", "DUTY_CYCLE_DRIFT"}
    assert out["window_end"] == iso(T0 + 8 * D)

    f = client.get(f"/v1/models/{APPLIANCE}/forecast", params={"start": iso(T0 + 8 * D)})
    assert f.status_code == 200
    assert len(f.json()["points"]) == 24
    assert f.json()["points"][0]["ts"] == iso(T0 + 8 * D)


def test_other_learning_window_is_stale(client):
    client.post(f"/v1/models/{APPLIANCE}/train", json=TRAIN)
    r = client.post(f"/v1/models/{APPLIANCE}/score", json=score_body(T0 + 8 * D, window_start=iso(T0 + D)))
    assert r.status_code == 409 and r.json()["status"] == "stale"


def test_too_little_training_data_is_422(client):
    body = {**TRAIN, "samples": TRAIN["samples"][:600]}
    r = client.post(f"/v1/models/{APPLIANCE}/train", json=body)
    assert r.status_code == 422 and r.json()["status"] == "insufficient_data"


@pytest.mark.parametrize("bad", [
    {"appliance_type": "TOASTER"},
    {"samples": [{"ts": "not a time", "watts": 1}]},
    {"samples": [{"ts": "2031-01-01T00:00:00Z", "watts": -5}]},
])
def test_invalid_requests_are_422(client, bad):
    assert client.post(f"/v1/models/{APPLIANCE}/train", json={**TRAIN, **bad}).status_code == 422


def test_path_must_be_a_uuid(client):
    assert client.post("/v1/models/..%2Fetc/train", json=TRAIN).status_code in (404, 422)
    assert client.post("/v1/models/not-a-uuid/train", json=TRAIN).status_code == 422


def test_models_survive_a_restart_with_a_volume(tmp_path):
    first = TestClient(create_app(str(tmp_path)))
    assert first.post(f"/v1/models/{APPLIANCE}/train", json=TRAIN).status_code == 200
    second = TestClient(create_app(str(tmp_path)))
    assert second.get("/health").json()["models"] == 1
    assert second.post(f"/v1/models/{APPLIANCE}/score", json=score_body(T0 + 8 * D)).status_code == 200


def test_without_a_volume_a_restart_forgets(tmp_path):
    TestClient(create_app(None)).post(f"/v1/models/{APPLIANCE}/train", json=TRAIN)
    assert TestClient(create_app(None)).get("/health").json() == {"status": "UP", "models": 0, "persistent": False}


def test_corrupt_model_file_is_skipped(tmp_path):
    (tmp_path / f"{APPLIANCE}.json").write_text("{not json")
    (tmp_path / "junk.json").write_text("{}")
    c = TestClient(create_app(str(tmp_path)))
    assert c.get("/health").json()["models"] == 0


def test_delete_forgets_the_model(client):
    client.post(f"/v1/models/{APPLIANCE}/train", json=TRAIN)
    assert client.delete(f"/v1/models/{APPLIANCE}").status_code == 204
    assert client.get(f"/v1/models/{APPLIANCE}").status_code == 404


def test_metrics_are_prometheus_text(client):
    client.post(f"/v1/models/{APPLIANCE}/train", json=TRAIN)
    client.post(f"/v1/models/{APPLIANCE}/score", json=score_body(T0 + 8 * D))
    client.post(f"/v1/models/{uuid.uuid4()}/score", json=score_body(T0 + 8 * D))
    r = client.get("/metrics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/plain")
    text = r.text
    assert 'ml_requests_total{endpoint="train",outcome="200"} 1' in text
    assert 'ml_requests_total{endpoint="score",outcome="200"} 1' in text
    assert 'ml_requests_total{endpoint="score",outcome="404"} 1' in text
    assert "ml_models 1" in text
    assert "# TYPE ml_request_duration_seconds summary" in text
