#!/usr/bin/env bash
# Corre los tests Deno OFFLINE de las funciones (los mismos que corre el CI).
# Sin salida a internet: `--allow-net` se acota al bind local que hace
# `Deno.serve` cuando un test importa un `index.ts`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mapfile -t FILES < <(bash "$ROOT/scripts/deno-test-selection.sh" offline)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No se encontraron tests Deno offline" >&2
  exit 1
fi

cd "$ROOT/supabase/functions"
IMPORT_MAP="$(mktemp "${TMPDIR:-/tmp}/liftgo-deno-import-map.XXXXXX.json")"
trap 'rm -f -- "$IMPORT_MAP"' EXIT
node "$ROOT/scripts/ci/deno-import-map.mjs" "$IMPORT_MAP"
deno cache --frozen --import-map="$IMPORT_MAP" --node-modules-dir=auto "${FILES[@]}"
deno test --frozen --cached-only --import-map="$IMPORT_MAP" --parallel --allow-env --allow-read --allow-net=0.0.0.0:8000 \
  --node-modules-dir=auto "$@" "${FILES[@]}"
