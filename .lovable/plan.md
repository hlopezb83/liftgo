# Sprint 3 · Ola 3.9 — Cierre UX-M3, UX-M4, UX-M5 y propagación UX-M6

## Auditoría Ola 3.8 (v7.130.0)
- Vitest **1124/1124 verde** (+3).
- Índice `invoices_booking_period_uniq` verificado en producción; pre-check 0 duplicados.
- `create_recurring_invoice` idempotente ante `unique_violation`.
- Sin bugs pendientes. Verde para avanzar.

## Alcance
Cerrar los 4 UX pendientes de la auditoría integral (30/34 → **34/34**).

### 1. UX-M3 · sr-only en español en Dialog/Sheet
- `src/components/ui/dialog.tsx` línea 44 y `src/components/ui/sheet.tsx` línea 60: cambiar `"Close"` → `"Cerrar"` en el `<span className="sr-only">` del botón de cierre. Localización obligatoria (proyecto es-MX).
- Test: snapshot mínimo en Testing Library verificando `getByText("Cerrar")` accesible.

### 2. UX-M6 (propagación) · EmptyState honesto en páginas migradas
Wire de `filters.hasActive` + `filters.clear` a `ListPageLayout` en las 12 páginas ya migradas a `useTableFilters`:
`InvoicesPage`, `QuotesPage`, `BookingsPage`, `CuentasPorPagarPage`, `CustomersPage`, `SuppliersPage`, `FleetPage`, `MaintenancePage`, `ContractsPage`, `DamageTrackingPage`, `AuditTrailPage`, `ChangelogPage`.
- Confirmar que `useTableFilters` ya expone `hasActive` y `clear`; si no, extender el hook (una sola vez) y actualizar su test.
- Cambio mecánico por página (2 props); sin lógica nueva.

### 3. UX-M4 · Dead-ends en 6 páginas de detalle
Auditar las 6 vistas de detalle señaladas por la auditoría y garantizar botón "Volver" consistente + breadcrumb. Identificar primero (rg sobre `pages` sin `<BackButton|useNavigateTransition`) y luego aplicar `DetailPageHeader` con `backTo`. Alcance máximo 6 archivos.

### 4. UX-M5 · Overflow-x en portal móvil
Auditar las 10 páginas de `src/features/portal/pages/` a viewport 375px con Playwright. Para las que tengan scroll horizontal indeseado, envolver tablas en `<div className="overflow-x-auto -mx-4 px-4">` o migrar a `MobileCardList` según el patrón del proyecto. Cero cambios de lógica.

## Detalles técnicos

**Migraciones DB**: ninguna.
**Edge Functions**: ninguna.
**Nuevos tests (esperados)**:
- `dialog.test.tsx` / `sheet.test.tsx`: 1 test cada uno para `sr-only "Cerrar"`.
- `useTableFilters.test.tsx`: extender si se añade `hasActive`/`clear`.
- Playwright visual del portal móvil (opcional; sólo si detectamos overflow).

**Riesgos**: bajos. Todos los cambios son presentational o strings. La única extensión no trivial es asegurar que `useTableFilters` exponga `hasActive`/`clear` — si ya lo hace, el sprint es 100% wiring.

**Verificación**:
1. `bunx vitest run` → 1124+ verde.
2. Playwright smoke opcional del portal a 375px.
3. Publicar **v7.131.0** con desglose por hallazgo cerrado.

## Salida esperada
- Auditoría integral: **34/34 hallazgos cerrados** (100%).
- Sin cambios de dominio/negocio; puro pulido UX + a11y + localización.
