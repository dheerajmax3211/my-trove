#!/usr/bin/env bash
# Stop everything started by dev/up.sh.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for pidfile in "$ROOT"/dev/.state/pids/*.pid; do
  [ -f "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  kill -0 "$pid" 2>/dev/null && kill "$pid" && echo "stopped $(basename "$pidfile" .pid)"
  rm -f "$pidfile"
done
# ml-service runs as a container (dev/up.sh); its models stay in the my-trove-ml-models volume.
if [ -n "$(docker ps -q --filter name=^my-trove-ml-service$ 2>/dev/null)" ]; then
  docker stop my-trove-ml-service >/dev/null && echo "stopped ml-service"
fi
