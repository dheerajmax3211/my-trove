#!/usr/bin/env bash
# Stop everything started by dev/up.sh.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for pidfile in "$ROOT"/dev/.state/pids/*.pid; do
  [ -f "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  kill -0 "$pid" 2>/dev/null && kill "$pid" && echo "stopped $(basename "$pidfile" .pid)"
  rm -f "$pidfile"
done
