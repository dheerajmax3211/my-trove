#!/usr/bin/env bash
# Point every web app at a real Firebase project, or back at the local dev identity provider.
#   FIREBASE_PROJECT_ID=my-proj FIREBASE_API_KEY=AIza... FIREBASE_APP_ID=1:123:web:abc dev/use-firebase.sh
#   dev/use-firebase.sh --dev-idp        # switch back to the local identity provider
# Optional: FIREBASE_AUTH_DOMAIN (default <project>.firebaseapp.com). Rewrites ui-common/apps/*/.env.local.
# These values are Firebase *web config* identifiers, not secrets. Service account keys are never needed here.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS=(workspace site hub waiting-on consent home-pulse ask-your-life digital-legacy family-treasury)

if [ "${1:-}" = "--dev-idp" ]; then
  body=$'# Local dev against the real services: run dev/up.sh at the repo root first (see dev/README.md).\nVITE_DEV_IDP_URL=http://localhost:9100\n'
else
  : "${FIREBASE_PROJECT_ID:?set FIREBASE_PROJECT_ID}" "${FIREBASE_API_KEY:?set FIREBASE_API_KEY}" "${FIREBASE_APP_ID:?set FIREBASE_APP_ID}"
  domain="${FIREBASE_AUTH_DOMAIN:-$FIREBASE_PROJECT_ID.firebaseapp.com}"
  body="# Real Firebase project. Run services with REAL_FIREBASE=1 (see dev/FIREBASE.md).
VITE_FIREBASE_API_KEY=$FIREBASE_API_KEY
VITE_FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
VITE_FIREBASE_AUTH_DOMAIN=$domain
VITE_FIREBASE_APP_ID=$FIREBASE_APP_ID
"
fi
for app in "${APPS[@]}"; do
  # Every app talks to the gateway: /api/<service>/v1/... (the hub calls several services, so it takes the bare /api)
  case "$app" in
    hub|workspace) api="http://localhost:8080/api" ;;   # these call several services through the gateway
    site)          api="" ;;                             # the public site calls no API
    *)             api="http://localhost:8080/api/$app" ;;
  esac
  if [ -n "$api" ]; then printf '%sVITE_API_BASE_URL=%s\n' "$body" "$api" > "$ROOT/ui-common/apps/$app/.env.local"
  else printf '%s' "$body" > "$ROOT/ui-common/apps/$app/.env.local"; fi
  echo "wrote ui-common/apps/$app/.env.local"
done
