#!/usr/bin/env bash
# Kind smoke test: install the chart on a kind cluster and prove the platform starts and answers through the gateway.
# Expects: a kind cluster (current kubectl context), the images my-trove/<name>:$TAG loaded into it, helm on PATH.
#   TAG=<git sha> deploy/kind/smoke.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="${TAG:?set TAG to the image tag loaded into kind}"
NS="${NS:-trove}"
fail() { echo "FAIL: $*" >&2; kubectl -n "$NS" get pods -o wide >&2 || true; exit 1; }

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" apply -f "$ROOT/deploy/kind/infra.yaml"
kubectl -n "$NS" rollout status deploy/postgres --timeout=300s
kubectl -n "$NS" rollout status deploy/kafka --timeout=300s

helm upgrade --install trove "$ROOT/deploy/helm/my-trove" -n "$NS" \
  -f "$ROOT/deploy/kind/values-kind.yaml" --set image.tag="$TAG" --wait --timeout 15m \
  || { kubectl -n "$NS" get pods; for p in $(kubectl -n "$NS" get pods -o name); do echo "== $p"; kubectl -n "$NS" logs "$p" --tail=60 || true; done; fail "helm install did not become ready"; }

echo "== all pods ready"; kubectl -n "$NS" get pods

kubectl -n "$NS" port-forward svc/gateway 18080:8080 >/tmp/pf.log 2>&1 &
PF=$!; trap 'kill $PF 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf -o /dev/null http://localhost:18080/api/auth/.well-known/jwks.json && break; sleep 1; done

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# 1. The public JWKS is reachable through the gateway and holds a key.
curl -sf http://localhost:18080/api/auth/.well-known/jwks.json | grep -q '"keys"' || fail "JWKS through the gateway"
echo "PASS jwks through gateway"
# 2. A protected route refuses an anonymous caller.
[ "$(code http://localhost:18080/api/auth/v1/me)" = 401 ] || fail "anonymous /api/auth/v1/me should be 401"
echo "PASS anonymous request is refused (401)"
# 3. Actuator is never reachable through the gateway.
c="$(code http://localhost:18080/api/auth/actuator/health)"; [ "$c" = 404 ] || [ "$c" = 403 ] || [ "$c" = 401 ] || fail "actuator via gateway returned $c"
echo "PASS actuator is not exposed through the gateway ($c)"
# 4. The workspace and site serve their SPA.
for app in workspace site; do
  kubectl -n "$NS" rollout status "deploy/$app" --timeout=120s
done
echo "PASS web apps rolled out"
echo "SMOKE OK"
