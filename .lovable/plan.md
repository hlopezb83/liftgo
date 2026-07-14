# Auditoría Sprint B (v7.64.0) + Sprint C propuesto

## Auditoría de Sprint B

### ✅ Funciona

- **B1 — Deuda de Sprint A cerrada**:
  - `SupplierRepStatusBadge` (22 LOC) ahora envuelve el `StatusBadge` global — API pública intacta.
  - `StatusBadgeApproval` en `BillApprovalSection.tsx:34` reducido a un wrapper de `StatusBadge` con mapa semántico (`approved→confirmed`, `rejected→cancelled`, etc.).
  - `SwipeableCard.tsx` — `text-white` eliminado.
- **B2/B3/B4 — Migración a `DataTableV2**`:
  - `BankStatementLinesTable` (96 LOC), `PaymentsExportTable` (152 LOC) y `PaymentIntentsSection` (209 LOC) usan `useLiftgoTable` + `DataTableV2` con `ColumnDef` tipado (sin `any`).
  - Row-click de drill-down preservado.
  - Props externas de selección/edición de `PaymentsExportTable` correctamente puenteadas.
- Sin regresiones de lint/tipos ni imports huérfanos de las tablas nativas anteriores.
- No quedan instancias de `text-white` en `src/` (grep limpio).

### 🐛 Bugs / observaciones

- **Ninguno crítico.** Observaciones menores:
  1. `PaymentIntentsSection` quedó en 209 LOC — dentro del límite (≤150 pauta general, ≤250 aceptable en tablas) pero cerca del borde. No urge partir.
  2. `StatusBadgeApproval` en `BillApprovalSection.tsx` sigue existiendo como wrapper local (5 LOC). Es aceptable — el mapa `APPROVAL_STATUS_MAP`/`_LABELS` es específico del módulo. No hay duplicación real de lógica de badge.
  3. La densidad de las 3 tablas nuevas hereda el default de `DataTableV2` (compacta zebra). Consistente con el resto de la app.

### 🧪 Tests

- No se añadieron. Justificación: son refactors 1:1 de UI (misma data, misma interacción). El costo/beneficio de tests de snapshot es bajo.
- **Recomendación**: si en Sprint D (Buttons/Modals) tocamos flujos de aprobación de facturas, sí conviene un test de integración de `BillApprovalSection` (aprobar/rechazar). Se defiere.

### Veredicto

Sprint B **aprobado**. Cierra formalmente la deuda de Sprint A y consolida el sistema de tablas.

---

## Sprint C — Layout & Density Tokens (propuesto)

Del plan original de 5 sprints (`.lovable/plan.md`), Sprint C ataca **consistencia de layout de páginas** y **tokens de espaciado**. Hoy cada página tiene su propia combinación de `space-y-*`, paddings de contenedor y anchos de header — se nota que las escribieron programadores distintos (queja original del usuario).

### Alcance

**C1. Token de layout de página**

- Crear `src/components/layout/PageContainer.tsx` — wrapper estándar con `space-y-6 p-6` (o el que definamos) y variante `dense` (`space-y-4 p-4`) para listados.
- Reemplazar `<div className="space-y-6">` / `space-y-4` / `p-6` ad-hoc en las 10 páginas top:
  - `/invoices`, `/accounts-payable`, `/bookings`, `/quotes`, `/customers`, `/fleet`, `/maintenance`, `/inventory`, `/expenses`, `/dashboard`.

**C2. `DetailPageHeader` universal**

- Existe `DetailPageHeader` (mem: component-library). Auditar uso en detalles: `InvoiceDetail`, `BookingDetail`, `QuoteDetail`, `CustomerDetail`, `SupplierBillDetail`, `MaintenanceWorkDetail`.
- Migrar los detalles que aún tienen header custom (probablemente 2–3).
- Estandarizar slots: título, subtítulo/breadcrumb, badge de estado, acciones a la derecha.

**C3. `ListPageHeader` estándar**

- Nuevo componente para páginas de listado: título + acciones + `FiltersToolbar` (ya canónico).
- Migrar las 10 páginas top a este patrón. Elimina el drift de layout entre `/invoices` (que ya usa `FiltersToolbar`) y otras.

**C4. Tokens de spacing en `tailwind.config**`

- Definir `--space-page`, `--space-section`, `--space-card` como CSS vars.
- Documentar en `mem://arch/ui/spacing-tokens`.

### Fuera de alcance

- Sprint D: botones y modales (unificar variantes, tamaños, footers de dialog).
- Sprint E: polish general (empty states, loading skeletons).
- Cambios de negocio o de datos.

### Detalles técnicos

- `PageContainer`: componente puro, sin lógica. Props: `children`, `dense?: boolean`, `className?` (para escape hatch controlado).
- `ListPageHeader` / `DetailPageHeader` co-ubicados en `src/components/layout/`.
- Verificación visual con Playwright a 1600x900 en las 10 rutas migradas (screenshots antes/después).
- Sin cambios a `useTableFilters`, `DataTableV2`, ni a hooks de datos.
- Changelog: **v7.65.0** (minor — estandarización de layout).

### Entregable

- 3 componentes nuevos (`PageContainer`, `ListPageHeader`, actualización de `DetailPageHeader`).
- 10 páginas de listado + 2–3 detalles migrados.
- Entrada en changelog + memoria de arquitectura de tokens de spacing.

¿Ejecuto Sprint C con este alcance? Si prefieres arrancar por otro (D o E), lo ajusto. Sprint C