#!/usr/bin/env bash
# Start the web apps' dev servers (Vite). Stop them with dev/down.sh.
#   dev/web.sh                 workspace (5190) and the public site (5191): the normal pair
#   dev/web.sh all             also the seven standalone product apps (5181-5187)
#   dev/web.sh workspace hub   just these
# Needs `pnpm install` in ui-common. Logs: dev/.state/logs/web-<app>.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/dev/.state"
mkdir -p "$STATE/logs" "$STATE/pids"
if [ $# -eq 0 ]; then set -- workspace site; fi
if [ "$1" = all ]; then set -- workspace site hub waiting-on consent home-pulse ask-your-life digital-legacy family-treasury; fi
for app in "$@"; do
  pidfile="$STATE/pids/web-$app.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "$app already running"; continue; fi
  cd "$ROOT/ui-common"
  nohup pnpm --filter "@platform/$app" dev > "$STATE/logs/web-$app.log" 2>&1 < /dev/null &
  echo $! > "$pidfile"
  echo "started $app"
done
echo "workspace: http://localhost:5190   site: http://localhost:5191   stop: dev/down.sh"
