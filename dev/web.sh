#!/usr/bin/env bash
# Start the web apps' dev servers (Vite). Stop them with dev/down.sh.
#   dev/web.sh                 workspace (5190) and the public site (5191)
#   dev/web.sh workspace       just these (also: site, gallery)
# Every product runs inside the workspace (/app/<product>); there are no standalone product apps.
# Needs `pnpm install` in ui-common. Logs: dev/.state/logs/web-<app>.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/dev/.state"
mkdir -p "$STATE/logs" "$STATE/pids"
if [ $# -eq 0 ]; then set -- workspace site; fi
for app in "$@"; do
  case "$app" in
    workspace | site | gallery) ;;
    *) echo "unknown web app '$app' (workspace, site or gallery; products run inside the workspace)" >&2; exit 2 ;;
  esac
done
for app in "$@"; do
  pidfile="$STATE/pids/web-$app.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "$app already running"; continue; fi
  cd "$ROOT/ui-common"
  nohup pnpm --filter "@platform/$app" dev > "$STATE/logs/web-$app.log" 2>&1 < /dev/null &
  echo $! > "$pidfile"
  echo "started $app"
done
echo "workspace: http://localhost:5190   site: http://localhost:5191   stop: dev/down.sh"
