#!/usr/bin/env bash
# Lighthouse baseline para LiftGo.
#
# Corre Lighthouse contra rutas públicas y guarda los reportes JSON en
# docs/lighthouse/. Las rutas autenticadas se documentan a mano porque
# Lighthouse en CI requiere flujo de login custom (puppeteer script).
#
# Uso:
#   ./scripts/lighthouse-baseline.sh
#
# Requisitos:
#   - Node.js + npx
#   - Chrome o Chromium instalado
set -euo pipefail

BASE_URL="${BASE_URL:-https://liftgo.lovable.app}"
OUT_DIR="docs/lighthouse"
mkdir -p "$OUT_DIR"

PUBLIC_ROUTES=(
  "/"
  "/portal/login"
)

for route in "${PUBLIC_ROUTES[@]}"; do
  slug=$(echo "$route" | sed 's|/|_|g; s|^_||; s|^$|root|')
  [ -z "$slug" ] && slug="root"
  echo "→ Lighthouse: ${BASE_URL}${route}"
  npx --yes lighthouse "${BASE_URL}${route}" \
    --preset=desktop \
    --output=json \
    --output-path="${OUT_DIR}/${slug}.json" \
    --chrome-flags="--headless=new --no-sandbox" \
    --quiet
done

echo ""
echo "✅ Reportes guardados en ${OUT_DIR}/"
echo "   Actualiza docs/lighthouse/baseline.md con los scores nuevos."
