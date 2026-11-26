# 0005: Actuator on a private management port

**Context.** Prometheus needs `/actuator/prometheus` without a user token, but the public port must never expose it.

**Decision.** Each service serves actuator on its main port plus 1000. A startup guard refuses a management port that
is blank or equal to the main port. The gateway blocks `/actuator/**`, the Kubernetes Service exposes only the main
port, and NetworkPolicy admits the management port only from the monitoring namespace.

**Consequences.** Scrapes and probes work without credentials; a misconfiguration fails at startup, not silently.
Metrics are unauthenticated inside the cluster, so they must never carry personal data (labels use route templates;
tested).
