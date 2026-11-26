#!/usr/bin/env bash
# Reproduces the numbers in ml-service/MODEL_CARD.md. Needs Docker and a JDK (for ./mvnw); installs nothing on the host.
#
#   ml-service/eval/run.sh            # export episodes (Java simulator + MAD replay), then score them with the ML model
#   SKIP_EXPORT=1 ml-service/eval/run.sh tuning   # reuse the exported episodes, score the tuning split
#
# Output: ml-service/eval/out/scenarios/*.json.gz (episodes), ml-service/eval/out/results-<split>.json, tables on stdout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SPLIT="${1:-evaluation}"
OUT="$ROOT/ml-service/eval/out"
IMAGE="${ML_TEST_IMAGE:-my-trove/ml-service:test}"

if [ "${SKIP_EXPORT:-0}" != 1 ]; then
  rm -rf "$OUT/scenarios"
  (cd "$ROOT" && ./mvnw -B -ntp -q -pl home-pulse -am test -Dtest=MlEvaluationExportTest \
      -Dsurefire.failIfNoSpecifiedTests=false -Dml.eval.out="$OUT/scenarios")
fi
docker build -q --target test -t "$IMAGE" "$ROOT/ml-service" >/dev/null
docker run --rm -v "$OUT:/srv/eval/out" "$IMAGE" \
  python -m eval.evaluate /srv/eval/out/scenarios --split "$SPLIT" --json "/srv/eval/out/results-$SPLIT.json"
