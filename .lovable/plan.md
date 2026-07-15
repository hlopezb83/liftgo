## Contexto

En el último run de CI fallaron **solo los dos shards de E2E**. Los demás jobs (Vitest, RLS, tsc, Build, Deno, ESLint, Knip, Actionlint, Secrets) pasan. Desglose:

- **Shard 1 (2/32 fail):**
  - `daterange-picker.spec.ts` → timeout esperando `gridcell` con nombre `^5$` en `/quotes/new`.
  - `filters-invoices.spec.ts` → timeout esperando `tab` con nombre `/pendiente/i` en `/invoices`.
- **Shard 2 (15/36 fail):** todas las specs `visual-desktop.spec.ts` y `visual-mobile.spec.ts` fallan con `A snapshot doesn't exist … writing actual.` No hay baselines en el repo.
- **ESLint**: `0 errors, 154 warnings` (job pasó). Igual conviene resolver los `react-hooks/refs` reales de `useTableFilters.ts`, pero no es lo que rompe CI.
- **Actionlint**: solo `info` de `SC2012` en `supabase-lint.yml` (no bloqueante).

## Objetivo

Dejar el pipeline en verde estabilizando E2E, sin tocar lógica de negocio.

## Plan

### 1. `daterange-picker.spec.ts` — corregir selector del calendario

Después de la migración a `react-day-picker` v10 + `Intl` formatter (v7.62.1), las celdas ya no exponen `name: "5"` sino algo como `"5 de julio de 2026"`. Ajustar el test:

- Cambiar `gridcell({ name: /^5$/ })` por `gridcell({ name: /\b5\b/ })` filtrando por celdas *no disabled*, o mejor usar el atributo `aria-label` real emitido por react-day-picker (`"5th"` / `"5 de julio"`).
- Añadir `await grid.waitFor()` y forzar mes visible con `page.getByRole("button", { name: /siguiente|próximo/i })` si el día 5 ya pasó en el mes actual.

### 2. `filters-invoices.spec.ts` — hacer selector StatusTabs robusto

El tab existe pero el test corre antes de que el fetch de facturas resuelva. Ajustar:

- Esperar `page.getByRole("tablist")` a estar visible antes del primer `click`.
- Usar `getByRole("tab", { name: /pendientes?/i })` (plural, coincide con el label actual `"Pendientes"`).
- Añadir `await page.waitForLoadState("networkidle")` tras `goto("/invoices")`.

### 3. Baselines visuales (`visual-desktop` / `visual-mobile`)

Los 15 fallos son por baseline inexistente. Dos opciones:

**A. Generar y comitear baselines** (recomendado para regresión visual real).
- Ejecutar `bun run test:e2e:update-snapshots` en el sandbox Linux (misma plataforma que CI, `chromium-linux`).
- Commit de los `.png` en `tests/e2e/*.spec.ts-snapshots/`.

**B. Marcar los specs como `test.skip` hasta tener baselines** si preferimos no versionar PNGs.

Propuesta: **Opción A** — ya está el script listo (`test:e2e:update-snapshots`) y el CI lo espera; sin baselines la suite visual nunca dará verde.

### 4. Higiene menor (no bloqueante, opcional en el mismo sprint)

- Silenciar `react-hooks/refs` en `useTableFilters.ts` moviendo `f.accessors` a variables locales fuera de `useMemo` (o justificando con comentario).
- Reemplazar `ls` por `find` en `supabase-lint.yml` (line 33) para limpiar `actionlint`.

## Verificación

- Correr `bun run test:e2e -- --grep "daterange|filters-invoices"` local (Playwright headless).
- Correr `bun run test:e2e:update-snapshots` y confirmar diff estable en dos corridas consecutivas.
- Push a rama y validar workflow verde.

## Changelog

Entrada `v7.72.1` (patch) — "CI verde: selectores E2E robustos y baselines visuales."
