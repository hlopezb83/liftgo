# Arreglar CI: eliminar archivos huérfanos detectados por Knip

## Problema

El job **Lint, Knip, Tests, Build** del CI falla en el paso de Knip estricto (`--include files,dependencies,binaries`), que rompe el PR cuando hay archivos sin uso. Lint, Vitest y Build pasan limpios. El job E2E falla por falta de secrets pero tiene `continue-on-error: true`, así que no bloquea.

Knip reporta 4 archivos huérfanos (sin importadores en `src/`):

1. `src/features/quotes/components/quotes/QuotePreviewDialog.tsx`
2. `src/lib/crm/crmToast.ts`
3. `src/lib/errors/index.ts`
4. `src/lib/ui/appFeedback.ts`

Probablemente quedaron sin uso tras refactors recientes (incluida la limpieza de la página de cotizaciones).

## Cambios

1. Borrar los 4 archivos listados arriba.
2. Verificar que `bun run lint`, `bunx knip --include files,dependencies,binaries --reporter compact` y `bun run test` queden en verde localmente.
3. Agregar entrada de changelog `6.14.8` (patch):
   - `public/changelog.json` (índice, al inicio)
   - `public/changelog/v6.14.8.json` (detalle)
   - Título: "Limpieza de archivos huérfanos para CI"
   - Descripción: eliminación de `QuotePreviewDialog`, `crmToast`, `lib/errors/index`, `appFeedback` para que Knip estricto no rompa el pipeline.

## Notas técnicas

- No se tocan rutas, hooks ni RPCs.
- Las advertencias de complejidad de ESLint (`QuoteDetailActions`, `errorDetailsExtract`, `deriveErrorCode`, `formatReportText`) son `warning`, no `error`, por lo que **no bloquean** el CI y quedan fuera de este cambio.
- Las deprecation warnings de Node 20 en GitHub Actions (`actions/checkout@v4`, `denoland/setup-deno@v1`, `actions/upload-artifact@v4`) son informativas hasta junio 2026 y se atienden en un cambio aparte si se desea.
- El job E2E seguirá marcado como fallido hasta que se configuren los secrets `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, pero no bloquea el merge.
