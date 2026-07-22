#!/usr/bin/env bash
# scripts/arch-check.sh — Guardrails de arquitectura (v7.178.0).
#
# Verificaciones estáticas rápidas (rg-based, sin instalar dependencias):
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
#   G5. Cross-feature deep imports: se listan como advertencia.
#       El guardrail duro es ESLint (`no-restricted-imports` cross-feature,
#       nivel `warn`). Aquí publicamos el conteo para trend.
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
errorCatalog.ts
invoiceHelpers.ts
invoiceTotals.ts
lineItems.ts
rentalCalculation.ts
roles.ts
satCatalogs.ts
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

# ---------- G4: Supabase en pages/components ----------
echo "-- G4: no supabase en features/*/pages|components"
sup_leak=$(rg -l "from ['\"]@/integrations/supabase/client['\"]" \
  src/features/**/pages src/features/**/components \
  --glob '!**/__tests__/**' --glob '!**/*.test.*' 2>/dev/null || true)
# Excepción documentada: auth pre-sesión
sup_leak=$(echo "$sup_leak" | grep -v "^src/features/auth/pages/AuthPage.tsx$" | grep -v '^$' || true)
if [ -n "$sup_leak" ]; then
  echo "${RED}FAIL${RESET} — supabase importado en UI:"
  echo "$sup_leak"
  FAIL=1
else
  echo "${GREEN}OK${RESET}"
fi

# ---------- G5: cross-feature deep imports (métrica, no bloqueo) ----------
echo "-- G5: cross-feature deep imports (métrica)"
cf_count=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  src_feat=$(echo "$file" | awk -F/ '{print $3}')
  while IFS= read -r tgt; do
    [ -z "$tgt" ] && continue
    if [ "$src_feat" != "$tgt" ]; then
      cf_count=$((cf_count + 1))
    fi
  done < <(rg -oN "@/features/[a-z-]+/" "$file" 2>/dev/null | sed 's|@/features/||;s|/||' | sort -u)
done < <(rg -lN "^import .* from ['\"]@/features/[a-z-]+/(hooks|components|lib|pages)/" \
  src/features --glob '!**/__tests__/**' --glob '!**/*.test.*' 2>/dev/null || true)

# Umbral: hasta 20 permitidos (baseline en v7.177.0 = 12).
if [ "$cf_count" -gt 20 ]; then
  echo "${RED}FAIL${RESET} — $cf_count cross-feature deep imports (umbral 20)."
  FAIL=1
elif [ "$cf_count" -gt 12 ]; then
  echo "${YELLOW}WARN${RESET} — $cf_count cross-feature deep imports (baseline 12)."
else
  echo "${GREEN}OK${RESET} — $cf_count cross-feature deep imports (baseline 12)."
fi

echo ""
if [ "$FAIL" = "1" ]; then
  echo "${RED}${BOLD}arch:check FALLIDO${RESET}"
  exit 1
fi
echo "${GREEN}${BOLD}arch:check OK${RESET}"
