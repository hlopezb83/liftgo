# Auditoría visual — Lote 2

El fix crítico del sidebar (Tailwind v4 `w-[var(--sidebar-width)]`) y el saneo de `<Table>` ya están en `v7.40.0`. Los 3 subagentes barrieron formularios, detalles y listados y encontraron redundancias y ajustes finos, no bugs bloqueantes. Este plan los agrupa por dolor visual.

## Lote 1 — CTAs duplicados en listados (alto impacto)

En 8 páginas se pasa `usePageActions({ onNew })` (que ya renderiza el botón en el header global) **y** además se pasa `actions=<Button>Nuevo…</Button>` a `ListPageLayout`, produciendo dos botones idénticos en desktop.

Quitar el `actions` local (o el `usePageActions`, según qué otras acciones ya vivan ahí) en:

- `src/features/bookings/pages/BookingsPage.tsx`
- `src/features/customers/pages/CustomersPage.tsx` (también el `mobileFab` custom → usa el estándar)
- `src/features/fleet/pages/FleetPage.tsx`
- `src/features/quotes/pages/QuotesPage.tsx`
- `src/features/invoices/pages/InvoicesPage.tsx`
- `src/features/maintenance/pages/MaintenancePage.tsx`
- `src/features/suppliers/pages/SuppliersPage.tsx`
- `src/features/accounts-payable/pages/CuentasPorPagarPage.tsx`

Criterio: si `actions` sólo trae "Nuevo X", eliminarlo. Si trae exportar/otros, dejar sólo los extras y quitar el "Nuevo".

## Lote 2 — Grids KPI y dashboard

- `src/features/dashboard/pages/Dashboard.tsx:25` — skeleton `lg:grid-cols-5` no coincide con `StatCards` (`xl:grid-cols-5`). Unificar a `xl:grid-cols-5` para evitar salto en 1024-1279px.
- `src/features/dashboard/components/dashboard/StatCards.tsx:20` — cambiar `grid-cols-2 md:grid-cols-3 xl:grid-cols-5` a `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` para llenar tablet landscape sin fila huérfana.

## Lote 3 — Grids de detalle (tablet)

Aprovechar mejor 768-1024px:
- `src/features/fleet/pages/ForkliftDetail.tsx:81` — añadir breakpoint `md:grid-cols-2 lg:grid-cols-3`.
- `src/features/customers/pages/CustomerDetailPage.tsx:69` — mismo patrón.
- `src/features/suppliers/pages/SupplierDetailPage.tsx:109/123` — alinear ambas filas al mismo breakpoint (`md:grid-cols-2 lg:grid-cols-3`).

## Lote 4 — Overlays y diálogos

- `src/components/ui/alert-dialog.tsx:17` — reemplazar overlay `bg-black/80` por `bg-background/80 backdrop-blur-sm` para consistencia con `Dialog` estándar y soporte tema claro/oscuro.
- `src/components/ui/ErrorDetailsDialog.tsx:69` — `max-h-[60vh]` demasiado alto en tablet landscape (768px alto); bajar a `max-h-[50vh]` o cambiar a `flex-1 min-h-0` para que el footer sticky no salga del viewport.
- `src/features/damage/components/damage/ImageGalleryLightbox.tsx:73` — añadir `max-w-6xl` junto al `max-w-[95vw]` para evitar estiramiento en desktop grande.

## Lote 5 — Headers y sheets

- `src/components/layout/DetailPageHeader.tsx:37-38` y `src/components/layout/PageHeader.tsx:29` — quitar `truncate` del título/subtítulo o cambiar a `line-clamp-2` para que en tablet portrait no se corte información crítica del nombre/modelo.
- `src/features/feedback/components/FeedbackDetailSheet.tsx:50` y `src/features/bank-reconciliation/components/BankLineDetailSheet.tsx:69` — `sm:max-w-xl` se siente apretado; subir a `sm:max-w-2xl` para tablet.

## Verificación

Playwright headless (1280×1800 desktop, 1024×768 tablet-landscape, 768×1024 tablet-portrait) en las 8 páginas del Lote 1 más `/`, `/mrr`, un detalle de flota y un detalle de proveedor. Confirmar visualmente:
- Un solo CTA "Nuevo" por página.
- KPIs en fila completa sin huecos raros en 1024px.
- Sin doble scroll en `ErrorDetailsDialog` a 768px alto.
- Títulos largos legibles en tablet portrait.

## Entregable

Changelog `v7.41.0` (minor) documentando cada lote y sus archivos.

## Fuera de alcance

- Migrar filtros inline a `Sheet` también en tablet (Lote 3.1 del auditor) — cambio de UX, requiere confirmación aparte.
- Sustituir `touch:h-11` por media queries de capacidad — cosmético, no urgente.
- Reescribir `mobileFab` con detección de `BottomNav` — bug menor, sólo aparece en overlaps puntuales.
