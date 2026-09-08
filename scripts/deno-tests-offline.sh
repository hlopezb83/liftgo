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
exec deno test --parallel --allow-env --allow-read --allow-net=0.0.0.0:8000 \
  --node-modules-dir=auto "$@" "${FILES[@]}"
