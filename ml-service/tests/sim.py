"""Python port of home-pulse's test simulator (``home-pulse/src/test/.../sim/ApplianceSimulator.java``).

Same patterns and constants (fridge: ~115 W compressor, ~24 min on / ~45 min off, diurnal demand swing, day-to-day
weather, door openings, 1.5% sensor noise, 0.3% dropouts; AC: ~950 W, cycles only when warm, power follows the
outdoor temperature), with numpy's RNG instead of java.util.Random, so the streams are statistically alike but not
bit-identical. The published evaluation (eval/) uses the Java simulator itself; this port only serves the unit tests.

Samples are (epoch seconds, watts) tuples at 1-minute resolution.
"""

from __future__ import annotations

import math
from typing import Callable

import numpy as np

Degradation = Callable[[float], float]
DAY = 86_400


def none(_t: float) -> float:
    return 0.0


def ramp(onset: float, per_day: float) -> Degradation:
    return lambda t: 0.0 if t < onset else (t - onset) / DAY * per_day


def step(onset: float, size: float) -> Degradation:
    return lambda t: 0.0 if t < onset else size


def _hour(t: float) -> float:
    return (t % DAY) / 3600.0


def _weather(days: int, rnd: np.random.Generator, sigma: float) -> np.ndarray:
    w = 1.0 + sigma * rnd.standard_normal(days)
    return np.maximum(0.8, w) if sigma < 0.5 else w


def fridge(start: float, days: int, seed: int, power: Degradation = none,
           runs: Degradation | None = None) -> list[tuple[float, float]]:
    runs = runs or (lambda t: 0.8 * power(t))
    rnd = np.random.default_rng(seed)
    out = []
    on, remaining, extra_on = False, 20, 0
    weather = _weather(days + 1, rnd, 0.04)
    for m in range(days * 1440):
        t = start + 60 * m
        demand = (1 + 0.25 * math.sin(2 * math.pi * (_hour(t) - 9) / 24.0)) * weather[m // 1440]
        if rnd.random() < 3.0 / 1440:
            extra_on += 6
        if remaining <= 0:
            on = not on
            if on:
                remaining = int(max(8, round((24 + 3 * rnd.standard_normal()) * demand * (1 + runs(t))) + extra_on))
                extra_on = 0
            else:
                remaining = int(max(15, round((45 + 6 * rnd.standard_normal()) / demand)))
        remaining -= 1
        if rnd.random() < 0.003:
            continue
        watts = (115 * (1 + power(t)) * (1 + 0.015 * rnd.standard_normal()) if on
                 else max(0.0, 2.5 + 0.2 * rnd.standard_normal()))
        out.append((t, watts))
    return out


def air_conditioner(start: float, days: int, seed: int, power: Degradation = none) -> list[tuple[float, float]]:
    rnd = np.random.default_rng(seed)
    out = []
    weather = _weather(days + 1, rnd, 1.0)
    on, remaining = False, 10
    for m in range(days * 1440):
        t = start + 60 * m
        deg = power(t)
        temp = 30 + 6 * math.sin(2 * math.pi * (_hour(t) - 9) / 24.0) + (weather[m // 1440] - 1.0)
        demand = max(0.0, min(1.0, (temp - 26) / 8))
        cooling = demand > 0.1
        if remaining <= 0:
            if cooling:
                on = not on
                remaining = (round((10 + 20 * demand) * (1 + 0.5 * deg) + rnd.standard_normal()) if on
                             else round(25 - 15 * demand + rnd.standard_normal()))
            else:
                on, remaining = False, 10
            remaining = max(remaining, 5)
        remaining -= 1
        if not cooling and on and remaining < 0:
            on = False
        if rnd.random() < 0.003:
            continue
        watts = (950 * (1 + deg) * (1 + 0.03 * (temp - 30) / 6.0) * (1 + 0.015 * rnd.standard_normal())
                 if on and cooling else max(0.0, 1.2 + 0.1 * rnd.standard_normal()))
        out.append((t, watts))
    return out


def stuck_on(samples, start: float, end: float, watts: float, seed: int = 1):
    """Every sample in [start, end) becomes a constant ON draw (home-pulse's simulator ANOMALY scenario)."""
    rnd = np.random.default_rng(seed)
    return [(t, watts * (1 + 0.01 * rnd.standard_normal())) if start <= t < end else (t, w) for t, w in samples]


def between(samples, start: float, end: float):
    return [(t, w) for t, w in samples if start <= t < end]
