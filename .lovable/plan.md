# Lote A — Mejoras visuales de alto impacto

Implementar los 5 hallazgos críticos del reporte de auditoría visual (`/mnt/documents/ui-audit-v7.181/report.md`) que atacan jerarquía, legibilidad y accesibilidad sin tocar lógica de negocio.

## Alcance

### A1. Dashboard: jerarquía entre KPIs de flota y financieros
- En `src/features/dashboard/pages/Dashboard.tsx`, agrupar visualmente:
  - Bloque **Operación** (StatCards) con un `SectionHeading` "Operación".
  - Bloque **Finanzas** (FinancialKpiCards) con `SectionHeading` "Finanzas" y separador sutil (`border-t border-border/50 pt-6`).
- Reducir densidad: `gap-6` → `gap-4` entre secciones, mantener `gap-3` dentro de cada grid.

### A2. Filtros con labels truncados en `/expenses` (y auditoría rápida)
- Revisar `FiltersToolbar` / `useTableFilters` en la ruta `/cuentas-por-pagar`.
- Aumentar `min-width` de los `SelectTrigger` de filtros de fecha a `min-w-[180px]` y permitir wrap del texto del trigger (`whitespace-normal` no; en su lugar acortar labels a "Por vencer 7d", "Vencidas", etc. en la fuente de opciones).

### A3. Configuración: 8 tabs que se envuelven
- En la página de Configuración/Operaciones (`src/features/settings/...`), migrar los `TabsList` horizontales a un layout vertical en desktop (`lg:grid lg:grid-cols-[220px_1fr]`) manteniendo el patrón horizontal en mobile.
- Sin cambiar la estructura de contenido de cada tab.

### A4. Icon-only buttons sin `aria-label`
- Barrido con `rg` sobre `<Button.*size="icon"` y `<button.*aria-label` faltante en:
  - Tablas de acciones (Facturas, Cotizaciones, Flotilla).
  - Toolbars de detalle (Reservas, Mantenimiento).
- Añadir `aria-label` descriptivo (en español) a cada uno detectado. Meta: 0 icon-only sin label en las 11 rutas auditadas.

### A5. Contraste de badges "Vencida" y estados destructivos
- Revisar `StatusBadge` para estados `overdue`, `cancelled`, `rejected`: subir contraste a `bg-destructive/15 text-destructive` (hoy `bg-destructive/10`) y añadir `border border-destructive/20` para AA en fondos zebra.

## Fuera de alcance (Lote B/C)
- Rediseño de gráficas del dashboard.
- Migración de tablas restantes a `DataTableV2`.
- Mejoras de mobile más allá de lo tocado colateralmente.

## Detalles técnicos

- Solo cambios de presentación: componentes en `src/components/**`, `src/features/**/components/**`, `src/features/dashboard/pages/Dashboard.tsx`.
- Sin migraciones DB, sin edge functions, sin cambios en hooks de datos.
- Tokens semánticos siempre (nada de `text-white`, `bg-black`).
- Al final: `tsgo` + `bunx vitest run` + `scripts/arch-check.sh` en verde.
- Verificación visual con Playwright en las 5 rutas afectadas (`/`, `/cuentas-por-pagar`, `/settings`, `/invoices`, `/fleet`) y comparar contra los screenshots baseline en `/mnt/documents/ui-audit-v7.181/`.
- Nuevo changelog `v7.181.0` (minor) en `public/changelog.json` + `public/changelog/v7.181.0.json`.

## Entregable
Preview navegable con los 5 hallazgos resueltos + nuevos screenshots en `/mnt/documents/ui-audit-v7.181/after/` para diff visual.
