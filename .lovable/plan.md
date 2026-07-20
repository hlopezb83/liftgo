## Auditoría Ola 4.a-b (v7.114.7)

- ESLint: 25 warnings, 0 errores ✅ (49 → 25, −24 confirmado).
- Vitest: 1083 tests verdes en la corrida previa ✅.
- Changelog íntegro: entrada v7.114.7 + detalle creados en orden descendente ✅.
- Sin bugs regresivos detectados. Los disables aplicados están justificados (compound component, code-splitting, `Date.now()` snapshot, ComponentType estable, handler-only ref).
- Tests faltantes: los cambios de Ola 4.a-b son mecánicos (autofix de imports, aliases de navegación, `useMemo` sin cambio semántico); no requieren tests nuevos porque no modifican comportamiento observable.

**Green-light para continuar.**

## Distribución actual (25 warnings)

| Regla | Count |
|---|---|
| react-hooks/set-state-in-effect | 7 |
| react-hooks/incompatible-library | 6 |
| max-lines-per-function | 6 |
| complexity | 3 |
| react-compiler/react-compiler | 2 |
| max-lines | 1 |

## Sprint Ola 4.c-d-e — Cierre de ESLint (25 → 0)

### Ola 4.c — set-state-in-effect residual (7 warnings)

Objetivo: eliminar los 7 restantes preservando comportamiento de `react-hook-form` (varios son `form.reset()` post-mount).

Estrategia por archivo:
- `PostDeliveryPickupDialog.tsx:62` — patrón `if (!open) setShowForm(false)` → mover a `onOpenChange` del `Dialog`, no requiere `useEffect`.
- Los otros 6 (Post*Delivery/Policy/PickupDialog, ListPageLayout, useChangelogDeepLink, CustomersPage) ya llevan disable justificado desde Ola 3.b; validar que sigan siendo los mismos y consolidar comentarios.

Verificación: correr Vitest y hacer un smoke Playwright del diálogo migrado.

### Ola 4.d — incompatible-library (6 warnings, todos `form.watch(...)`)

Archivos: `CancelCfdiDialog`, `CancelCreditNoteDialog`, `CompanyLogoTab`, más 3 pendientes por ubicar.

Estrategia canónica: reemplazar `form.watch("campo")` por `useWatch({ control: form.control, name: "campo" })` de `react-hook-form`. `useWatch` es compatible con React Compiler porque re-renderiza vía suscripción interna, no cierra sobre una función no-memoizable.

Riesgo: cambia levemente el timing de re-render (más granular, sólo cuando ese campo cambia). No afecta lógica; sí mejora perf.

Verificación: tests existentes de esos diálogos + smoke manual de "Cancelar CFDI motivo 01" (necesita substitution UUID).

### Ola 4.e — Complejidad, tamaño y react-compiler (9 warnings)

1. **`useTableFilters.ts` (5 warnings)** — máxima prioridad, es infraestructura crítica de filtros:
   - Extraer `normalizeValue` (complexity 16) a `src/hooks/filters/normalizeValue.ts` y dividir el switch por tipo (`string` / `array` / `date-range`) para bajar a ≤10.
   - Extraer el arrow function del setter URL (complexity 18) a helper puro `buildNextSearchParams(prev, values, facets)`.
   - Extraer sub-hooks: `useFilterUrlSync`, `useFilterDebounce`. Meta: función principal ≤150 líneas, archivo ≤300 líneas.
   - Eliminar el disable de react-compiler removiendo la causa raíz (probablemente el `eslint-disable` en el `useMemo` de facets).

2. **`MrrDetailPage.tsx` (166 LOC)** — extraer `<MrrKpiRow />` y `<MrrTable />` a subcomponentes.

3. **`PaymentIntentsSection.tsx` (153 LOC)** — extraer `<PaymentIntentRow />` y `<PaymentIntentEmptyState />`.

4. **`InvoiceForm.tsx` (151 LOC)** — extraer `<InvoiceFormHeader />` (breadcrumb + acciones); es el corte más limpio con menor riesgo.

5. **Segundo `react-compiler`** — resolver como efecto colateral del refactor de `useTableFilters`.

### Alcance excluido

- No se tocará business logic (facturación, CFDI, RLS). Sólo estructura de componentes/hooks.
- No se cambiarán APIs públicas de `useTableFilters`; la firma de retorno queda idéntica.

## Verificación (todo el sprint)

1. `bunx eslint .` → 0 warnings, 0 errores.
2. Vitest suite completa (1083 tests) → verde.
3. Smoke Playwright:
   - Filtros en Facturas (recorrido crítico de `useTableFilters`).
   - Cancelación CFDI con motivo 01 (recorrido de `useWatch`).
   - Post-delivery dialog (recorrido de `onOpenChange`).
4. Changelog: `v7.115.0` (minor por refactor de `useTableFilters`) con entrada índice + detalle.

## Entregable

- **v7.115.0** con las 3 sub-olas ejecutadas en un solo sprint.
- Objetivo final: **0 warnings ESLint** en `bunx eslint .`.

## Detalles técnicos

- `useWatch` vs `form.watch`: la sustitución requiere pasar `control` explícitamente y renombrar la variable si colisiona. No romper `defaultValue` — usar el `defaultValues` del form.
- El refactor de `useTableFilters` NO debe cambiar la estabilidad del objeto retornado; mantener `useMemo` con las mismas dependencias primitivas.
- Los split de páginas grandes deben preservar los `data-testid` existentes que consumen tests E2E de Playwright.
