#!/bin/sh
# Fetches the Model2Vec model Ask Your Life embeds with (minishlab/potion-base-2M, MIT licence) from Hugging Face,
# pinned to one revision, and verifies both files against fixed SHA-256 sums. Nothing else is downloaded.
#
#   ask-your-life/model/fetch-model.sh [target-dir]      default: ask-your-life/model/potion-base-2M
#
# Idempotent: files already present with the right checksum are kept, so it is cheap to call from every build.
# Used by: the Maven build (-Dfetch-model, see ask-your-life/pom.xml), deploy/docker/service.Dockerfile (the
# ask-your-life image carries the model so it runs offline) and dev/up.sh. The binary files are never committed.
# POSIX sh on purpose: it also runs inside the JRE image during the Docker build.
set -eu

REPO="minishlab/potion-base-2M"
REVISION="389b9f64be5aa4ae7a6bc6fe95ef20ce485ae5da"
MODEL_SHA256="f95ffde02ad06f63ae38eb9d400038cd5ccaf8411ec3cb650c6025113f96cbb8"   # model.safetensors, 7,559,256 bytes
TOKENIZER_SHA256="e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50" # tokenizer.json, 683,666 bytes

TARGET="${1:-$(cd "$(dirname "$0")" && pwd)/potion-base-2M}"
mkdir -p "$TARGET"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

fetch() { # fetch <file> <sha256>
  file="$1"; want="$2"; dest="$TARGET/$file"
  if [ -f "$dest" ] && [ "$(sha256 "$dest")" = "$want" ]; then
    echo "fetch-model: $file present and verified"
    return 0
  fi
  tmp="$dest.part"
  rm -f "$tmp"
  echo "fetch-model: downloading $REPO@$REVISION/$file"
  curl -fsSL --retry 3 --retry-delay 2 -o "$tmp" "https://huggingface.co/$REPO/resolve/$REVISION/$file"
  got="$(sha256 "$tmp")"
  if [ "$got" != "$want" ]; then
    rm -f "$tmp"
    echo "fetch-model: checksum mismatch for $file (got $got, want $want)" >&2
    exit 1
  fi
  mv "$tmp" "$dest"
  echo "fetch-model: $file verified"
}

fetch model.safetensors "$MODEL_SHA256"
fetch tokenizer.json "$TOKENIZER_SHA256"
