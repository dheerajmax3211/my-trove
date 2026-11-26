"""A few counters in the Prometheus text exposition format (no client library needed for this little)."""

from __future__ import annotations

import threading
from collections import defaultdict


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._requests: dict[tuple[str, str], int] = defaultdict(int)
        self._seconds: dict[str, float] = defaultdict(float)
        self._calls: dict[str, int] = defaultdict(int)
        self._anomalies: dict[str, int] = defaultdict(int)

    def observe(self, endpoint: str, outcome: str, seconds: float) -> None:
        with self._lock:
            self._requests[(endpoint, outcome)] += 1
            self._seconds[endpoint] += seconds
            self._calls[endpoint] += 1

    def anomaly(self, kind: str) -> None:
        with self._lock:
            self._anomalies[kind] += 1

    def render(self, models: int) -> str:
        with self._lock:
            lines = [
                "# HELP ml_requests_total Requests by endpoint and outcome.",
                "# TYPE ml_requests_total counter",
            ]
            for (endpoint, outcome), n in sorted(self._requests.items()):
                lines.append(f'ml_requests_total{{endpoint="{endpoint}",outcome="{outcome}"}} {n}')
            lines += [
                "# HELP ml_request_duration_seconds Time spent handling requests.",
                "# TYPE ml_request_duration_seconds summary",
            ]
            for endpoint in sorted(self._calls):
                lines.append(f'ml_request_duration_seconds_sum{{endpoint="{endpoint}"}} {self._seconds[endpoint]:.6f}')
                lines.append(f'ml_request_duration_seconds_count{{endpoint="{endpoint}"}} {self._calls[endpoint]}')
            lines += [
                "# HELP ml_anomalies_total Anomalous features reported by score, by alert kind.",
                "# TYPE ml_anomalies_total counter",
            ]
            for kind, n in sorted(self._anomalies.items()):
                lines.append(f'ml_anomalies_total{{kind="{kind}"}} {n}')
            lines += [
                "# HELP ml_models Trained appliance models held in memory.",
                "# TYPE ml_models gauge",
                f"ml_models {models}",
            ]
            return "\n".join(lines) + "\n"
