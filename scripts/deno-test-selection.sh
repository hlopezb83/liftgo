#!/usr/bin/env bash
# Selección explícita de tests Deno de supabase/functions.
#
#   offline  → unitarios y de handler. No tocan la red: son los ÚNICOS que
#              corre el CI, y se ejecutan SIN --allow-net.
#   remote   → smoke de integración que hacen HTTP contra funciones YA
#              DESPLEGADAS (importan `_shared/test-helpers.ts`). NO son
#              cobertura de CI: solo bajo demanda y contra un backend aislado,
#              nunca contra producción.
#
# Uso: scripts/deno-test-selection.sh offline|remote
# Salida: rutas relativas a supabase/functions, una por línea.
set -euo pipefail

MODE="${1:-offline}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/functions"
cd "$ROOT"

# El marcador de "test remoto" es el import del helper HTTP compartido.
MARKER='_shared/test-helpers'

while IFS= read -r f; do
  if grep -q "$MARKER" "$f"; then
    [[ "$MODE" == "remote" ]] && echo "$f"
  else
    [[ "$MODE" == "offline" ]] && echo "$f"
  fi
done < <(find . -name '*_test.ts' ! -path './node_modules/*' | sort)
