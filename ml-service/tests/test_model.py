"""The model on simulated appliances (tests/sim.py ports home-pulse's simulator)."""

import math

import numpy as np
import pytest

from app import model as m
from app.model import ApplianceModel, InsufficientData
from tests import sim

T0 = 1_930_000_000 - (1_930_000_000 % sim.DAY)      # a midnight in 2031
D = sim.DAY
H = 3600


def train(samples, kind="FRIDGE", days=7):
    return ApplianceModel.train(sim.between(samples, T0, T0 + days * D), kind)


def hourly_scores(model, samples, start, end):
    """Scores every full hour in [start, end] like home-pulse's job; returns the anomalous (time, feature) pairs."""
    flagged = []
    for now in range(int(start), int(end) + 1, H):
        r = model.score(sim.between(samples, now - m.SCORE_LOOKBACK_S - H, now), now)
        flagged += [(now, f["name"]) for f in r["features"] if f["anomalous"]]
    return flagged


# ------------------------------------------------------------------ training


def test_learns_a_fridge():
    model = train(sim.fridge(T0, 7, 1))
    assert model.switching
    assert 20 < model.threshold < 90
    assert model.period == 24
    assert set(model.features) == {"on_power", "duty", "cycle_minutes"}
    assert all(t >= m.Z_MIN for t in model.thresholds.values())
    expected_power = model.profiles["on_power"]
    assert np.nanmin(expected_power) > 105 and np.nanmax(expected_power) < 125


def test_ac_is_judged_on_power_only():
    model = train(sim.air_conditioner(T0, 7, 1), "AIR_CONDITIONER")
    assert model.features == ("on_power",)


def test_weekly_profile_needs_three_weeks():
    assert train(sim.fridge(T0, 21, 2), days=21).period == 168
    assert train(sim.fridge(T0, 20, 2), days=20).period == 24


def test_refuses_too_little_data():
    with pytest.raises(InsufficientData):
        train(sim.fridge(T0, 2, 1), days=2)
    with pytest.raises(InsufficientData):
        ApplianceModel.train([], "FRIDGE")


def test_non_switching_load_models_power_only():
    rnd = np.random.default_rng(4)
    flat = [(T0 + 60 * i, 85 + 3 * rnd.standard_normal()) for i in range(7 * 1440)]
    model = ApplianceModel.train(flat, "OTHER")
    assert not model.switching
    assert model.features == ("on_power",)


# ------------------------------------------------------------------ forecast


def test_forecast_has_24_hourly_points_with_a_band():
    model = train(sim.fridge(T0, 7, 3))
    points = model.forecast(T0 + 7 * D + 1234, 24)
    assert len(points) == 24
    assert [p["ts"] for p in points] == [T0 + 7 * D + H * (k + 1) for k in range(24)]
    for p in points:
        assert p["lower_watts"] <= p["expected_watts"] <= p["upper_watts"]
        assert 20 < p["expected_watts"] < 80           # ~115 W x ~35% duty + standby
    # demand peaks in the afternoon in the simulator: the profile follows it
    by_hour = {(p["ts"] % D) // H: p["expected_watts"] for p in points}
    assert by_hour[15] > by_hour[3]


def test_ac_forecast_follows_the_day():
    model = train(sim.air_conditioner(T0, 7, 3), "AIR_CONDITIONER")
    by_hour = {(p["ts"] % D) // H: p["expected_watts"] for p in model.forecast(T0 + 7 * D, 24)}
    assert by_hour[15] > 5 * max(by_hour[3], 1.0)


# ------------------------------------------------------------------ normal weeks are not flagged


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
def test_normal_fridge_week_is_not_flagged(seed):
    data = sim.fridge(T0, 14, seed)
    model = train(data)
    assert hourly_scores(model, data, T0 + 7 * D + 10 * H, T0 + 14 * D) == []


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
def test_normal_ac_week_is_not_flagged(seed):
    data = sim.air_conditioner(T0, 14, seed)
    model = train(data, "AIR_CONDITIONER")
    assert hourly_scores(model, data, T0 + 7 * D + 10 * H, T0 + 14 * D) == []


# ------------------------------------------------------------------ injected faults are


def test_compressor_power_step_is_flagged_within_hours():
    onset = T0 + 9 * D
    data = sim.fridge(T0, 12, 1, sim.step(onset, 0.12))
    model = train(data)
    flagged = hourly_scores(model, data, T0 + 7 * D + 10 * H, T0 + 12 * D)
    assert flagged, "a 12% power step must be flagged"
    first, feature = flagged[0]
    assert feature == "on_power"
    assert onset <= first <= onset + 12 * H


def test_slow_degradation_is_flagged_before_the_built_in_10_percent_rule():
    onset = T0 + 8 * D
    data = sim.air_conditioner(T0, 22, 2, sim.ramp(onset, 0.01))
    model = train(data, "AIR_CONDITIONER")
    flagged = [t for t, f in hourly_scores(model, data, T0 + 7 * D + 10 * H, T0 + 22 * D) if f == "on_power"]
    assert flagged
    excess = (flagged[0] - onset) / D * 0.01
    assert 0.04 < excess < 0.10


def test_stuck_on_like_home_pulse_simulator_anomaly_is_flagged():
    """home-pulse's simulator ANOMALY scenario for a fridge: 168 W without pause for the last 6 hours."""
    end = T0 + 8 * D
    data = sim.stuck_on(sim.fridge(T0, 8, 5), end - 6 * H, end, 168)
    model = train(data)
    r = model.score(sim.between(data, end - m.SCORE_LOOKBACK_S - H, end), end)
    power = next(f for f in r["features"] if f["name"] == "on_power")
    duty = next(f for f in r["features"] if f["name"] == "duty")
    assert r["anomalous"] and power["anomalous"] and duty["anomalous"]
    assert power["direction"] == 1 and power["change_pct"] > 30


def test_refrigerant_leak_is_flagged_by_cycle_length():
    onset = T0 + 8 * D
    data = sim.fridge(T0, 22, 3, sim.none, sim.ramp(onset, 0.04))
    model = train(data)
    flagged = hourly_scores(model, data, T0 + 7 * D + 10 * H, T0 + 22 * D)
    assert any(f in ("cycle_minutes", "duty") for _, f in flagged)
    assert all(t >= onset for t, _ in flagged)
    assert not any(f == "on_power" for _, f in flagged)


# ------------------------------------------------------------------ decision details


def test_spike_is_not_sustained():
    end = T0 + 8 * D
    data = sim.stuck_on(sim.fridge(T0, 8, 6), end - 2 * H, end, 168)    # only the newest 2 hours
    model = train(data)
    r = model.score(sim.between(data, end - m.SCORE_LOOKBACK_S - H, end), end)
    assert not next(f for f in r["features"] if f["name"] == "on_power")["anomalous"]


def test_hysteresis_lowers_the_threshold_of_live_features():
    model = train(sim.fridge(T0, 9, 1))
    data = sim.fridge(T0, 9, 1)
    now = T0 + 8 * D
    normal = model.score(sim.between(data, now - m.SCORE_LOOKBACK_S, now), now)
    live = model.score(sim.between(data, now - m.SCORE_LOOKBACK_S, now), now, ["on_power"])
    t = {f["name"]: f["threshold"] for f in normal["features"]}
    tl = {f["name"]: f["threshold"] for f in live["features"]}
    assert tl["on_power"] == pytest.approx(m.HYSTERESIS * t["on_power"], rel=1e-3)
    assert tl["duty"] == t["duty"]


def test_too_little_recent_data_is_not_evaluated():
    data = sim.fridge(T0, 8, 1)
    model = train(data)
    now = T0 + 8 * D
    r = model.score(sim.between(data, now - 2 * H, now), now)
    assert not r["evaluated"] and not r["anomalous"]
    assert all(not f["evaluated"] and f["score"] is None for f in r["features"])


def test_serialisation_round_trip_scores_identically():
    data = sim.fridge(T0, 9, 2)
    model = train(data)
    copy = ApplianceModel.from_dict(model.to_dict())
    now = T0 + 8 * D + 5 * H
    window = sim.between(data, now - m.SCORE_LOOKBACK_S, now)
    assert copy.score(window, now) == model.score(window, now)
    assert copy.forecast(now) == model.forecast(now)


def test_completed_run_lengths():
    ts = np.arange(0, 60 * 20, 60, dtype=float)
    on = np.array([1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1], dtype=bool)
    # first and last ON runs touch the edges: only the 3- and 4-minute runs count
    assert m.mean_completed_run_minutes(ts, on) == pytest.approx(3.5)
    gap = ts.copy()
    gap[5:] += 600                                       # a 10-minute hole inside the 3-minute run
    assert math.isnan(m.mean_completed_run_minutes(gap, on))    # one completed run left: too few
