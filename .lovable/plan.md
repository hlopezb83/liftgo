## Estado verificado del R22

Revisé el documento contra el código actual. La mayoría ya está aplicada en rondas previas (v7.249.0–v7.252.0):

- ALTOS A/B, MEDIOS C→N y BAJOS O→W: aplicados.
- Pendiente C-1 (migración a `meta.kind`): hecho en v7.251.0 (55+ columnas).
- Pendiente C-2 (portal): `BrandMark` ya se usa en `CustomerPortalLayout`, el dashboard del portal usa `formatCompactCurrency` + `kpiSizeClass`, y la tabla del estado de cuenta ya usa el `Table` del sistema.
- Pendiente B-8 (conciliación): hecho en v7.246.0 con el workspace de 2 columnas y stat cards.

Quedan **2 pendientes reales**:

## 1. B-3 — Estados vacíos con acción (CTA)

Hoy `DataTableV2` solo acepta `emptyMessage` como texto plano ("No se encontraron clientes"), sin ícono ni botón. `EmptyState` (con `actionLabel`/`onAction`) existe pero solo se usa en páginas de detalle.

Qué haré:
- Permitir en `DataTableV2` un `emptyState?: ReactNode` opcional (además del `emptyMessage` actual, que queda igual para no tocar las demás tablas), renderizado dentro de la fila vacía con `colSpan` completo.
- Cablear el `EmptyState` con CTA en Clientes, Cotizaciones, Proveedores y Contratos, siguiendo el patrón de Flota:
  - Sin registros: ícono + "Aún no hay clientes" + botón "Nuevo cliente" que abre el mismo diálogo del toolbar.
  - Con filtros activos y 0 resultados: mensaje distinto ("Ningún resultado con estos filtros") + botón "Limpiar filtros".

## 2. B-11 — Kanban de CRM optimista al soltar

Hoy, al arrastrar una tarjeta a otra columna, `CRMPage.onDragEnd` abre el diálogo de edición en vez de mover. Se siente lento y rompe el gesto.

Qué haré:
- Mover directo al soltar con `useUpdateProspect`, agregando actualización optimista: `onMutate` toma un snapshot de la caché de prospectos, aplica el nuevo `stage` y `stage_order` con `setQueriesData`, y en `onError` revierte y muestra el toast de error.
- Conservar las reglas de negocio: si el destino es "Cerrado ganado" sigue pasando por `assertCanClose` (permiso admin) y por el diálogo, porque ese paso exige datos obligatorios; el resto de columnas se mueven directo.
- Reordenar dentro de la misma columna también optimista (hoy ya llama a la mutación, pero espera al servidor).

## Detalles técnicos

- `src/components/dataTable/v2/DataTableV2.tsx`, `DataTableBodyV2.tsx`, `VirtualBody.tsx`, `EmptyRow`: nueva prop opcional `emptyState`.
- Páginas: `CustomersPage.tsx`, `QuotesPage.tsx`, `SuppliersPage.tsx`, `ContractsPage.tsx` (usan `useListFilters`, así que el "hay filtros activos" sale del estado existente).
- CRM: `src/features/crm/pages/CRMPage.tsx` y `src/features/crm/hooks/useProspectMutations.ts` (`onMutate`/`onError`/`onSettled` sobre `prospectKeys`).
- Pruebas: unitarias para el reductor optimista del movimiento de etapa (mover, revertir en error) y para la lógica de "vacío por filtros" vs "vacío real".
- Cierre: `bun run lint`, vitest, y entrada de changelog v7.253.0 (`public/changelog.json` + `public/changelog/v7.253.0.json`).
