"""Second half of the evaluation (first half: home-pulse's MlEvaluationExportTest, see run.sh).

For every exported episode: train the ML model on the learning week (the same samples the built-in detector learned
from), replay it hourly over the remaining 16 days with an alert book like home-pulse's (open on an anomalous kind,
hysteresis while live, resolve after 3 clean evaluations), and compare its alert openings with the built-in (MAD)
detector's, which the export already replayed through the real Java code.

Only POWER_SHIFT and DUTY_CYCLE_DRIFT are compared: the run-length and silence rules are the same code in both paths.

    python -m eval.evaluate <scenario dir> [--split evaluation|tuning] [--json out.json]
"""

from __future__ import annotations

import argparse
import gzip
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

from app.model import FEATURE_KIND, SCORE_LOOKBACK_S, ApplianceModel

HOUR = 3600
DAY = 86400
RESOLVE_AFTER_CLEAR = 3
KINDS = ("POWER_SHIFT", "DUTY_CYCLE_DRIFT")


def ml_alerts(ep: dict) -> list[dict]:
    data = np.asarray(ep["samples"], dtype=float)
    ts = data[:, 0]
    train = data[ts < ep["learned_to"]]
    model = ApplianceModel.train(map(tuple, train), ep["type"])
    live: dict[str, int] = {}           # kind -> clean streak
    opened = []
    for now in range(ep["learned_to"] + HOUR, ep["end"] + 1, HOUR):
        lo, hi = np.searchsorted(ts, [now - SCORE_LOOKBACK_S - HOUR, now])
        live_features = [f for f, k in FEATURE_KIND.items() if k in live]
        r = model.score(map(tuple, data[lo:hi]), now, live_features)
        for kind in KINDS:
            feats = [f for f in r["features"] if f["kind"] == kind and f["evaluated"]]
            if not feats:
                continue
            if any(f["anomalous"] for f in feats):
                if kind not in live:
                    opened.append({"kind": kind, "opened": now})
                live[kind] = 0
            elif kind in live:
                live[kind] += 1
                if live[kind] >= RESOLVE_AFTER_CLEAR:
                    del live[kind]
    return opened


def excess_at(ep: dict, t: int) -> float:
    """True size of the fault at time t (fraction), for the 'caught at' column."""
    if ep["onset"] is None or t < ep["onset"]:
        return 0.0
    if ep["fault"] == "power_step":
        return ep["size"]
    return (t - ep["onset"]) / DAY * ep["size"]


def judge(ep: dict, alerts: list[dict]) -> dict:
    onset = ep["onset"]
    false_alerts = [a for a in alerts if onset is None or a["opened"] < onset]
    true_alerts = [a for a in alerts if onset is not None and a["opened"] >= onset]
    first = min(true_alerts, key=lambda a: a["opened"]) if true_alerts else None
    return {
        "false_alerts": len(false_alerts),
        "detected": first is not None,
        "latency_h": None if first is None else (first["opened"] - onset) / HOUR,
        "excess_at_detection": None if first is None else excess_at(ep, first["opened"]),
        "first_kind": None if first is None else first["kind"],
    }


def summarise(rows: list[dict]) -> dict:
    faults = [r for r in rows if r["onset"] is not None]
    tp = sum(r["detected"] for r in faults)
    fp = sum(r["false_alerts"] for r in rows)
    lat = [r["latency_h"] for r in faults if r["detected"]]
    return {
        "episodes": len(rows),
        "fault_episodes": len(faults),
        "detected": tp,
        "false_alerts": fp,
        "healthy_days": round(sum(((r["onset"] or r["end"]) - r["learned_to"]) / DAY for r in rows), 1),
        "precision": None if tp + fp == 0 else round(tp / (tp + fp), 3),
        "recall": None if not faults else round(tp / len(faults), 3),
        "median_latency_h": None if not lat else round(statistics.median(lat), 1),
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--split", default="evaluation")
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    files = sorted(Path(args.dir).glob(f"{args.split}_*.json.gz"))
    if not files:
        print(f"no {args.split} episodes in {args.dir}", file=sys.stderr)
        return 2
    rows = {"MAD": [], "ML": []}
    for path in files:
        with gzip.open(path, "rt") as fh:
            ep = json.load(fh)
        meta = {k: ep[k] for k in ("scenario", "seed", "type", "fault", "size", "onset", "learned_to", "end")}
        rows["MAD"].append({**meta, **judge(ep, ep["mad_alerts"])})
        rows["ML"].append({**meta, **judge(ep, ml_alerts(ep))})

    by_scenario = defaultdict(dict)
    for model, rs in rows.items():
        groups = defaultdict(list)
        for r in rs:
            groups[r["scenario"]].append(r)
        for sc, g in groups.items():
            s = summarise(g)
            caught = [r["excess_at_detection"] for r in g if r["detected"]]
            s["median_excess_at_detection_pct"] = None if not caught else round(100 * statistics.median(caught), 1)
            by_scenario[sc][model] = s
    overall = {m: summarise(rs) for m, rs in rows.items()}
    per_type = {m: {t: summarise([r for r in rs if r["type"] == t]) for t in ("FRIDGE", "AIR_CONDITIONER")}
                for m, rs in rows.items()}

    print(f"split={args.split} episodes={len(files)}")
    print("| scenario | model | detected | false alerts | median latency (h) | fault size when caught |")
    print("| --- | --- | --- | --- | --- | --- |")
    for sc in sorted(by_scenario):
        for m in ("MAD", "ML"):
            s = by_scenario[sc][m]
            det = f"{s['detected']}/{s['fault_episodes']}" if s["fault_episodes"] else "-"
            exc = "-" if s["median_excess_at_detection_pct"] is None else f"{s['median_excess_at_detection_pct']}%"
            lat = "-" if s["median_latency_h"] is None else s["median_latency_h"]
            print(f"| {sc} | {m} | {det} | {s['false_alerts']} | {lat} | {exc} |")
    print()
    print("| model | appliance | precision | recall | false alerts | healthy days | median latency (h) |")
    print("| --- | --- | --- | --- | --- | --- | --- |")
    for m in ("MAD", "ML"):
        for t, s in list(per_type[m].items()) + [("all", overall[m])]:
            print(f"| {m} | {t} | {s['precision']} | {s['recall']} | {s['false_alerts']} | {s['healthy_days']} "
                  f"| {s['median_latency_h']} |")
    if args.json:
        Path(args.json).write_text(json.dumps({"split": args.split, "overall": overall, "per_type": per_type,
                                               "by_scenario": by_scenario, "episodes": rows}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
