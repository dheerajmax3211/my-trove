"""Seasonal baseline + calibrated residual z-score for one appliance. Pure numpy, no I/O, deterministic.

Method (details and limits in MODEL_CARD.md):

1. **ON/OFF threshold** from the training data: midpoint of the 10th and 99th percentile of power (10% of the way
   for a washing machine), like home-pulse's rule-based detector. An appliance whose draw barely varies is
   "non-switching": every minute counts as ON and only its power level is modelled.
2. **Window features.** A window is the ``WINDOW_HOURS`` clock hours before a full hour. Per window: ``duty``
   (fraction of minutes ON), ``on_power`` (median ON power) and ``cycle_minutes`` (mean length of the ON runs
   that start and end inside the window). A window needs 70% of its minutes.
3. **Seasonal profile.** Every training window (one per hour) is filed under the slot of its end hour:
   hour-of-day (24 slots), or hour-of-week (168) once the training data spans three weeks. The profile is the
   median per slot, pooled with the two neighbouring slots. This is what the model adds over a single baseline:
   an AC that draws more on hot afternoons is compared with its own afternoons, not with a whole-day average.
4. **Residuals and calibration.** Residual = ``observed / expected - 1`` (power, cycle length) or ``observed -
   expected`` (duty). Over the training windows the residuals give a robust centre and sigma (1.4826 MAD, floored:
   2% for power, 0.02 for duty, 5% for cycle length), ``z = (residual - centre) / sigma``, and the threshold
   ``max(Z_MIN, CALIBRATION_MARGIN * max |z| seen in training)``: the training period itself would never alert.
5. **Decision.** A feature is anomalous when the windows ending at the newest ``SUSTAIN_STEPS`` full hours all
   deviate beyond the threshold in the same direction (sustained, not a spike). Score = min |z| / threshold.
   A feature with a live alert uses 70% of its threshold (hysteresis, as home-pulse's detector does).
   Separately, an hourly profile of mean power gives the 24-hour forecast with a p10..p90 band.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

import numpy as np

MODEL_NAME = "seasonal-robust-z"
MODEL_REVISION = 1

HOUR_S = 3600
MIN_COVERAGE = 0.7
MIN_TRAIN_HOURS = 72
MIN_CALIBRATION_WINDOWS = 24
WEEKLY_MIN_DAYS = 21
WINDOW_HOURS = 6
SUSTAIN_STEPS = 3
MIN_WINDOW_ON_MINUTES = 10
MIN_COMPLETED_RUNS = 2
MAX_GAP_S = 180
Z_MIN = 4.0
CALIBRATION_MARGIN = 1.25
HYSTERESIS = 0.7
MAD_TO_SIGMA = 1.4826
MIN_SLOT_VALUES = 3

FEATURES = ("on_power", "duty", "cycle_minutes")
RELATIVE = {"on_power": True, "duty": False, "cycle_minutes": True}
SIGMA_FLOOR = {"on_power": 0.02, "duty": 0.02, "cycle_minutes": 0.05}
FEATURE_KIND = {"on_power": "POWER_SHIFT", "duty": "DUTY_CYCLE_DRIFT", "cycle_minutes": "DUTY_CYCLE_DRIFT"}
APPLIANCE_TYPES = ("FRIDGE", "AIR_CONDITIONER", "WATER_PUMP", "WASHING_MACHINE", "OTHER")
ON_FRACTION = {"WASHING_MACHINE": 0.1}
# An AC runs as long as the weather makes it: without an outdoor temperature its duty and cycle length vary more from
# day to day than any learning week shows (tuning episodes raised false DUTY_CYCLE_DRIFT alerts on a hot day). The
# model judges only its power; home-pulse's built-in detector keeps judging its duty, with its 60% tolerance.
TYPE_FEATURES = {"AIR_CONDITIONER": ("on_power",)}
# how much history before "now" the score endpoint needs
SCORE_LOOKBACK_S = (WINDOW_HOURS + SUSTAIN_STEPS) * HOUR_S


class InsufficientData(ValueError):
    """Too few usable hours to learn anything."""


# ---------------------------------------------------------------------------------------------------- samples


def to_arrays(samples: Iterable[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray]:
    """(epoch seconds, watts) pairs to two float arrays sorted by time, one sample per minute (first wins)."""
    data = np.asarray(list(samples), dtype=float).reshape(-1, 2)
    if data.size == 0:
        return np.empty(0), np.empty(0)
    minute = np.floor(data[:, 0] / 60.0)
    _, first = np.unique(minute, return_index=True)   # unique() sorts, so this also orders by time
    data = data[first]
    return data[:, 0], data[:, 1]


def learn_threshold(watts: np.ndarray, appliance_type: str) -> tuple[float, bool]:
    """ON/OFF threshold and whether the appliance switches at all (else every minute counts as ON)."""
    standby = float(np.percentile(watts, 10))
    peak = float(np.percentile(watts, 99))
    switching = peak - standby > 10.0 and peak > 2.0 * max(standby, 0.5)
    if not switching:
        return -math.inf, False
    return standby + ON_FRACTION.get(appliance_type, 0.5) * (peak - standby), True


def mean_completed_run_minutes(ts: np.ndarray, on: np.ndarray) -> float:
    """Mean length of ON runs bounded on both sides by an OFF sample with no gap (> 3 min) in between."""
    if ts.size < 3:
        return math.nan
    gap = np.diff(ts) > MAX_GAP_S
    change = (np.diff(on.astype(np.int8)) != 0) | gap
    starts = np.concatenate(([0], np.nonzero(change)[0] + 1))
    ends = np.concatenate((starts[1:] - 1, [ts.size - 1]))
    lengths = []
    for k, (s, e) in enumerate(zip(starts, ends)):
        if not on[s] or k == 0 or k == len(starts) - 1:
            continue
        left = not gap[s - 1] and not on[s - 1]
        right = not gap[e] and not on[e + 1]
        if left and right:
            lengths.append((ts[e] - ts[s]) / 60.0 + 1)
    return float(np.mean(lengths)) if len(lengths) >= MIN_COMPLETED_RUNS else math.nan


def _pooled_median(keys: np.ndarray, values: np.ndarray, period: int) -> np.ndarray:
    """Median per slot, pooled with both neighbouring slots; NaN when fewer than MIN_SLOT_VALUES values."""
    out = np.full(period, np.nan)
    ok = ~np.isnan(values)
    keys, values = keys[ok], values[ok]
    for s in range(period):
        v = values[(keys == s) | (keys == (s - 1) % period) | (keys == (s + 1) % period)]
        if v.size >= MIN_SLOT_VALUES:
            out[s] = np.median(v)
    return out


def _pooled_band(keys: np.ndarray, values: np.ndarray, period: int) -> np.ndarray:
    """(period, 3): median, p10, p90 per slot (pooled like ``_pooled_median``)."""
    out = np.full((period, 3), np.nan)
    for s in range(period):
        v = values[(keys == s) | (keys == (s - 1) % period) | (keys == (s + 1) % period)]
        if v.size >= MIN_SLOT_VALUES:
            out[s] = (np.median(v), np.percentile(v, 10), np.percentile(v, 90))
    return out


# ---------------------------------------------------------------------------------------------------- model


@dataclass
class ApplianceModel:
    appliance_type: str
    threshold: float
    switching: bool
    period: int
    profiles: dict[str, np.ndarray]       # feature -> (period,) expected window value; "mean_power" -> (period, 3)
    calibration: dict[str, dict[str, float]]
    hours_used: int
    window_start: str | None = None
    window_end: str | None = None
    trained_at: str | None = None

    @property
    def version(self) -> str:
        return f"{MODEL_NAME}/{MODEL_REVISION}"

    @property
    def features(self) -> tuple[str, ...]:
        return tuple(self.calibration)

    @property
    def thresholds(self) -> dict[str, float]:
        return {f: c["threshold"] for f, c in self.calibration.items()}

    # -------------------------------------------------------------- window features

    def _window(self, ts: np.ndarray, watts: np.ndarray, end_hour: int) -> dict[str, float]:
        """Observed features of the window [end_hour - WINDOW_HOURS, end_hour) (NaN where unusable)."""
        out = {f: math.nan for f in FEATURES}
        lo, hi = np.searchsorted(ts, [(end_hour - WINDOW_HOURS) * HOUR_S, end_hour * HOUR_S])
        if hi - lo < MIN_COVERAGE * WINDOW_HOURS * 60:
            return out
        t, w = ts[lo:hi], watts[lo:hi]
        on = w > self.threshold
        if on.sum() >= MIN_WINDOW_ON_MINUTES:
            out["on_power"] = float(np.median(w[on]))
        if self.switching:
            out["duty"] = float(on.mean())
            out["cycle_minutes"] = mean_completed_run_minutes(t, on)
        return out

    @staticmethod
    def _residual(feature: str, observed: float, expected: float) -> float:
        if math.isnan(observed) or math.isnan(expected):
            return math.nan
        if RELATIVE[feature]:
            return observed / expected - 1.0 if expected > 0 else math.nan
        return observed - expected

    # -------------------------------------------------------------- train

    @classmethod
    def train(cls, samples: Iterable[tuple[float, float]], appliance_type: str) -> "ApplianceModel":
        ts, watts = to_arrays(samples)
        if ts.size < MIN_TRAIN_HOURS * 60 * MIN_COVERAGE:
            raise InsufficientData(f"need at least {MIN_TRAIN_HOURS} usable hours of minute samples")
        threshold, switching = learn_threshold(watts, appliance_type)

        hour_idx = np.floor(ts / HOUR_S).astype(np.int64)
        keys, start, counts = np.unique(hour_idx, return_index=True, return_counts=True)
        full = counts >= MIN_COVERAGE * 60
        if full.sum() < MIN_TRAIN_HOURS:
            raise InsufficientData(f"only {int(full.sum())} usable hours, need {MIN_TRAIN_HOURS}")
        span_days = (keys[-1] - keys[0] + 1) / 24.0
        period = 168 if span_days >= WEEKLY_MIN_DAYS else 24
        mean_power = np.add.reduceat(watts, start) / counts

        model = cls(appliance_type, threshold, switching, period, {}, {}, int(full.sum()))
        ends = np.arange(int(keys[0]) + WINDOW_HOURS, int(keys[-1]) + 2)
        observed = {f: np.array([model._window(ts, watts, int(e))[f] for e in ends]) for f in FEATURES}
        model.profiles["mean_power"] = _pooled_band(keys[full] % period, mean_power[full], period)
        for f in FEATURES:
            model.profiles[f] = _pooled_median(ends % period, observed[f], period)

        for f in TYPE_FEATURES.get(appliance_type, FEATURES):
            expected = model.profiles[f][ends % period]
            residuals = np.array([cls._residual(f, o, x) for o, x in zip(observed[f], expected)])
            residuals = residuals[~np.isnan(residuals)]
            if residuals.size < MIN_CALIBRATION_WINDOWS:
                continue                    # e.g. a non-switching load has no duty or cycles
            centre = float(np.median(residuals))
            sigma = max(MAD_TO_SIGMA * float(np.median(np.abs(residuals - centre))), SIGMA_FLOOR[f])
            worst = float(np.max(np.abs(residuals - centre))) / sigma
            model.calibration[f] = {"centre": centre, "sigma": sigma, "windows": int(residuals.size),
                                    "threshold": max(Z_MIN, CALIBRATION_MARGIN * worst)}
        if "on_power" not in model.calibration:
            raise InsufficientData("the appliance was not seen running in enough windows")
        return model

    # -------------------------------------------------------------- score

    def score(self, samples: Iterable[tuple[float, float]], now_s: float | None = None,
              live_features: Iterable[str] = ()) -> dict:
        """Judges the windows ending at the newest SUSTAIN_STEPS full clock hours before ``now_s``."""
        ts, watts = to_arrays(samples)
        if now_s is None:
            now_s = float(ts[-1]) + 60 if ts.size else 0.0
        end_hour = int(math.floor(now_s / HOUR_S))          # the running hour is incomplete
        ends = [end_hour - k for k in range(SUSTAIN_STEPS)]  # newest first
        windows = [self._window(ts, watts, e) for e in ends]
        live = set(live_features)
        results = []
        for f in self.features:
            cal = self.calibration[f]
            thr = cal["threshold"] * (HYSTERESIS if f in live else 1.0)
            expected = [float(self.profiles[f][e % self.period]) for e in ends]
            z = [(self._residual(f, w[f], x) - cal["centre"]) / cal["sigma"] for w, x in zip(windows, expected)]
            evaluated = not any(math.isnan(v) for v in z)
            anomalous, stat = False, None
            if evaluated:
                up = z[0] >= 0
                same = all((v >= 0) == up for v in z)
                stat = (1 if up else -1) * min(abs(v) for v in z) if same else 0.0
                anomalous = same and abs(stat) > thr
            observed, exp = windows[0][f], expected[0]
            change = (observed / exp - 1.0) * 100.0 if evaluated and abs(exp) > 1e-9 else None
            results.append({
                "name": f,
                "kind": FEATURE_KIND[f],
                "evaluated": evaluated,
                "anomalous": bool(anomalous),
                "statistic": None if stat is None else round(stat, 3),
                "threshold": round(thr, 3),
                "score": None if stat is None else round(abs(stat) / thr, 3),
                "direction": (1 if stat > 0 else -1) if anomalous else 0,
                "observed": None if math.isnan(observed) else round(observed, 4),
                "expected": None if math.isnan(exp) else round(exp, 4),
                "change_pct": None if change is None else round(change, 1),
                "z": [None if math.isnan(v) else round(v, 3) for v in z],
            })
        judged = [r for r in results if r["evaluated"]]
        return {
            "evaluated": bool(judged),
            "anomalous": any(r["anomalous"] for r in results),
            "score": max((r["score"] for r in judged), default=None),
            "window_hours": WINDOW_HOURS,
            "sustain_steps": SUSTAIN_STEPS,
            "window_end": end_hour * HOUR_S,
            "features": results,
        }

    # -------------------------------------------------------------- forecast

    def forecast(self, start_s: float, hours: int = 24) -> list[dict]:
        """Expected mean power (with the slot's p10..p90 band) for each of the next ``hours`` clock hours."""
        first = int(math.ceil(start_s / HOUR_S))
        out = []
        for h in range(first, first + hours):
            band = self.profiles["mean_power"][h % self.period]
            out.append({
                "ts": h * HOUR_S,
                "expected_watts": _num(band[0]),
                "lower_watts": _num(band[1]),
                "upper_watts": _num(band[2]),
            })
        return out

    # -------------------------------------------------------------- persistence

    def to_dict(self) -> dict:
        return {
            "model": MODEL_NAME,
            "revision": MODEL_REVISION,
            "appliance_type": self.appliance_type,
            "threshold": None if math.isinf(self.threshold) else self.threshold,
            "switching": self.switching,
            "period": self.period,
            "profiles": {k: np.vectorize(_exact, otypes=[object])(v).tolist() for k, v in self.profiles.items()},
            "calibration": self.calibration,
            "hours_used": self.hours_used,
            "window_start": self.window_start,
            "window_end": self.window_end,
            "trained_at": self.trained_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ApplianceModel":
        if d.get("model") != MODEL_NAME or d.get("revision") != MODEL_REVISION:
            raise ValueError("model file of another model or revision")
        profiles = {k: np.array(_denull(v), dtype=float) for k, v in d["profiles"].items()}
        threshold = -math.inf if d["threshold"] is None else float(d["threshold"])
        return cls(d["appliance_type"], threshold, bool(d["switching"]), int(d["period"]), profiles,
                   {f: {k: float(v) for k, v in c.items()} for f, c in d["calibration"].items()},
                   int(d["hours_used"]), d.get("window_start"), d.get("window_end"), d.get("trained_at"))


def _denull(v):
    return [_denull(x) for x in v] if isinstance(v, list) else (math.nan if v is None else float(v))


def _exact(x) -> float | None:
    return None if math.isnan(float(x)) else float(x)


def _num(x) -> float | None:
    return None if x is None or math.isnan(float(x)) else round(float(x), 4)
