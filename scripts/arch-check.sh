#!/usr/bin/env bash
# scripts/arch-check.sh — Guardrails de arquitectura (v7.178.0).
#
# Verificaciones estáticas (filesystem + AST TypeScript ya instalado):
#
#   G1. Prohibido re-introducir carpetas `src/features/*/api/`.
#       Consolidado en v7.177.0 → toda I/O va en `hooks/`.
#
#   G2. Freeze de `src/lib/domain/` — no permitir NUEVOS archivos.
#       Los existentes están documentados en su README con plan de migración
#       por feature. Nuevas constantes de dominio deben nacer en
#       `src/features/<feature>/lib/`.
#
#   G3. Prohibido crear `src/api/` en la raíz.
#
#   G4. Prohibido importar el cliente Supabase en `src/features/*/pages/**`
#       o `src/features/*/components/**` (ya lo cubre ESLint como `error`;
#       re-verificado aquí porque un rule crash silencioso puede saltárselo).
#
#   G5. Cross-feature deep imports: bloqueante, sólo barrels públicos.
#       Las fronteras G4/G5 se analizan mediante AST y rutas normalizadas.
#
# Uso local: `bun run arch:check`
# En CI: consumido por `.github/workflows/ci.yml` (job `arch-check`).

set -euo pipefail

FAIL=0
BOLD=$'\033[1m'
RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RESET=$'\033[0m'

echo "${BOLD}== arch:check ==${RESET}"

# ---------- G1: no re-introducir api/ ----------
echo "-- G1: no src/features/*/api/"
api_dirs=$(find src/features -type d -name api 2>/dev/null || true)
if [ -n "$api_dirs" ]; then
  echo "${RED}FAIL${RESET} — se encontró(n) carpeta(s) api/ prohibidas:"
  echo "$api_dirs"
  echo "  Regla: consolidado en v7.177.0 → mover a hooks/."
  FAIL=1
else
  echo "${GREEN}OK${RESET}"
fi

# ---------- G2: freeze de src/lib/domain/ ----------
# Allowlist congelada: lo que existía al v7.177.0. Agregar NUEVO archivo aquí
# requiere sprint dedicado (ver src/lib/domain/README.md).
echo "-- G2: freeze de src/lib/domain/ (solo archivos allowlisted)"
allowed=$(cat <<'EOF'
README.md
__tests__
activityTranslations.ts
bookingRates.ts
contractTypes.ts
customerTypes.ts
errorCatalog.ts
firstBillingPeriod.ts
invoiceHelpers.ts
invoiceStatus.ts
invoiceTotals.ts
lineItems.ts
nonRentalLines.ts
rentalCalculation.ts
roles.ts
satCatalogs.ts
stateMachines.ts
templateUtils.ts
EOF
)
domain_new=$(ls src/lib/domain 2>/dev/null | grep -vFxf <(echo "$allowed") || true)
if [ -n "$domain_new" ]; then
  echo "${RED}FAIL${RESET} — archivo(s) no allowlisted en src/lib/domain/:"
  echo "$domain_new"
  echo "  Regla: mover a src/features/<feature>/lib/ o actualizar allowlist en scripts/arch-check.sh."
  FAIL=1
else
  echo "${GREEN}OK${RESET}"
fi

# ---------- G3: no src/api/ raíz ----------
echo "-- G3: no src/api/ en raíz"
if [ -d src/api ]; then
  echo "${RED}FAIL${RESET} — src/api/ no debe existir. Toda I/O vive en features/<x>/hooks/."
  FAIL=1
else
  echo "${GREEN}OK${RESET}"
fi

# ---------- G4/G5: module boundaries (TypeScript AST) ----------
# Imports, re-exports, type imports and literal dynamic imports/require;
# both @/ aliases and relative paths, independent of line breaks/subdirectory.
echo "-- G4/G5: fronteras de módulos (AST, bloqueante)"
if ! node scripts/check-feature-imports.mjs; then
  FAIL=1
fi

echo ""
if [ "$FAIL" = "1" ]; then
  echo "${RED}${BOLD}arch:check FALLIDO${RESET}"
  exit 1
fi
echo "${GREEN}${BOLD}arch:check OK${RESET}"
