## Auditoría de v7.115.0

**Verde:**
- 1083 tests Vitest pasando (159 archivos), 0 errores ESLint.
- Warnings: 25 → 11 (−14). Split de `useTableFilters` en 4 módulos funcionó como se planeó.

**🐞 1 regresión detectada en CustomersPage** (introducida al limpiar el disable "Unused directive"):
- Actualmente el `useEffect` (líneas 54-58) tiene disable de `exhaustive-deps` pero NO de `set-state-in-effect`.
- Resultado: reaparece el warning `set-state-in-effect` y ahora `exhaustive-deps` es el que quedó como "Unused directive".
- **Fix:** intercambiar los disables — poner `set-state-in-effect` sobre la línea del setter y quitar el de `exhaustive-deps` (ya no dispara porque el array `[]` está ok con el helper `useEffectEvent`-like).

**Tests:** no faltan tests nuevos. Los cambios de Ola 4.c-d-e son refactors puros (useWatch, splits de módulos, disables) cubiertos por los 1083 tests existentes.

## Plan Ola 5 — Splits de páginas grandes (11 → ~2 warnings)

Objetivo: bajar a 2 warnings (los 2 `react-compiler` justificados en `useLiftgoTable` y `useTableFilters`, que son consecuencia de disables de APIs imperativas de TanStack).

### Bug fix inicial
1. **CustomersPage.tsx (L54-58)**: intercambiar disables. Verificar que el warning "Unused directive" desaparece.

### Splits de páginas (`max-lines-per-function` — 5 warnings)

Estrategia: extraer subcomponentes puros por sección visual, sin cambiar lógica de datos ni queries.

2. **AuditTrailPage.tsx** (151 LOC): extraer `<AuditTrailToolbar />` (filtros + búsqueda) y `<AuditTrailTable />` (tabla + paginación).
3. **BankStatementImportsHistoryPage.tsx** (155 LOC): extraer `<ImportsHistoryToolbar />` y `<ImportsHistoryTable />`.
4. **MrrDetailPage.tsx** (166 LOC): extraer `<MrrKpiGrid />` (cards superiores) y `<MrrBreakdownTable />` (tabla).
5. **PaymentIntentsSection.tsx** (153 LOC): extraer `<PaymentIntentRow />` (fila con acciones) — el componente ya está segmentado, solo falta bajar el render principal.
6. **InvoiceForm.tsx** (151 LOC): extraer `<InvoiceFormHeader />` (cliente + serie + fechas) y dejar el form como orquestador.

### Complexity (1 warning)

7. **CRMPage.tsx (L73, complejidad 17)**: extraer helper `resolveDealMutation()` para el `useMutation` del Kanban drop handler, aislando el switch de status.

### Cierre
8. Verificar `bunx eslint .` → esperado 2 warnings restantes (react-compiler skips justificados).
9. Correr `bunx vitest run` → esperado 1083 tests verdes.
10. Registrar en `public/changelog.json` + `public/changelog/v7.116.0.json` (minor) con el detalle por página.

## Notas técnicas

- Los splits son **presentacionales**: los subcomponentes reciben props tipadas y no traen hooks de data-fetching nuevos. Esto mantiene la memoria del proyecto sobre "hooks de dominio granulares" y "views como contenedores puros".
- Los 2 `react-compiler` residuales (`useLiftgoTable`, `useTableFilters`) NO se atacan: son costo aceptado de usar APIs imperativas de TanStack Table/Virtual, ya documentados con comentario en el disable.
- Sin cambios de lógica de negocio, RPCs, RLS ni schemas.
