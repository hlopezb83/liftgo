# Sprint I — Cierre auditoría visual 1600x900

Tres hallazgos detectados en la auditoría final. Todos son fixes acotados a UI/filtros, sin lógica de negocio.

## Alcance

### I1 · [P2] Quotes: Estado como Tabs
- **Archivo**: `src/features/quotes/components/QuotesFilters.tsx` (o equivalente).
- **Cambio**: reemplazar el `Select` de estado por `FiltersToolbar.StatusTabs` con opciones `Todos / Borrador / Enviada / Aceptada / Rechazada` (labels y valores tomados del schema actual).
- **Regla**: mantener el resto de filtros (customer, fechas) como están. Solo el estado sube a tabs.

### I2 · [P3] Maintenance: ClearAll faltante
- **Archivo**: `src/features/maintenance/components/maintenance/MaintenanceFiltersBar.tsx` + hook de filtros de maintenance.
- **Cambio**: exponer `hasActive` y `clearAll` desde el hook `useTableFilters` correspondiente y pasarlos al `FiltersToolbar.ClearAll` (ya soportado por el componente).
- **Regla**: reset debe limpiar search + forklift filter.

### I3 · [P2] Invoices/Bookings: revisar contraste de tab activo a 1600x900
- **Archivo**: `src/components/filters/FiltersToolbar.tsx` (subcomponente `StatusTabs`).
- **Cambio menor**: reforzar el estado activo del tab (borde inferior + peso tipográfico) sin romper el token semántico. Verificar con screenshot Playwright.

## Verificación

1. Reutilizar `/tmp/browser/visual-audit-h/audit.py` para volver a capturar `/quotes`, `/maintenance`, `/invoices` y `/bookings` a 1600x900.
2. Revisar screenshots con `code--view`.
3. Tests: extender `FiltersToolbar.test.tsx` sólo si se cambia la API de StatusTabs (no se prevé).

## Detalles técnicos

- No se toca `useTableFilters` central: sólo se conectan `hasActive` / `clearAll` donde falten.
- Sin cambios en queries ni RLS.
- Changelog: `public/changelog.json` + `public/changelog/v7.71.0.json` (minor: mejora visual + estandarización de filtros).

## Entregable

- Quotes con Tabs de estado.
- Maintenance con botón "Limpiar filtros".
- Tab activo más legible a 1600x900.
- Screenshots de verificación + changelog v7.71.0.
