# Auditoría Sprint A + Sprint B

## Auditoría de Sprint A (v7.63.0)

### ✅ Completado y funcional

- T1–T9: `text-white` eliminado en `StatusBadge`, `ReconciliationBadge`, `InvoiceDetailBadges`, `SupplierRepStatusBadge`, `BillApprovalSection`, `GanttRow`, `ActorAvatar`. Verificado visualmente en light mode.
- No introduce regresiones de theming ni de contraste.

### ⚠️ Deuda del alcance original del sprint

El plan de Sprint A también incluía **U4** y **U5** (consolidar `StatusBadgeApproval` local de `BillApprovalSection.tsx` y `SupplierRepStatusBadge.tsx` en el `StatusBadge` global). **No se hicieron.** Ambos badges siguen duplicando la lógica de `StatusBadge`:

- `src/features/accounts-payable/components/BillApprovalSection.tsx:26` — `StatusBadgeApproval` local.
- `src/features/accounts-payable/components/SupplierRepStatusBadge.tsx:14` — componente paralelo.

### 🐛 Bug menor detectado

- `src/components/feedback/SwipeableCard.tsx:101` — `text-white` hardcoded en botones swipe móviles. No es crítico (fondos custom por `a.className`), pero rompe el patrón que fijamos en Sprint A. Fix trivial: usar `text-primary-foreground` como default y dejar que `a.className` lo sobrescriba.

### 🧪 Tests

No se agregaron tests. Los cambios son puramente de clases Tailwind; un snapshot test añadiría poco valor. Se puede omitir.

---

## Sprint B — Tablas huérfanas + Modelos (propuesto)

Migrar 3 tablas nativas al sistema `DataTableV2` + `useLiftgoTable`, más la tabla de Modelos de Equipo (V2). Además cerrar la deuda de U4/U5 y el `text-white` de `SwipeableCard` para dejar Sprint A al 100%.

### Alcance

**B1. Cerrar deuda de Sprint A** (rápido, ~15 min)

- Consolidar `StatusBadgeApproval` en `BillApprovalSection.tsx` → usar `StatusBadge` con variantes semánticas mapeadas.
- Refactorizar `SupplierRepStatusBadge.tsx` para envolver `StatusBadge` (mantener API pública para no romper llamadas).
- `SwipeableCard.tsx:101`: `text-white` → `text-primary-foreground` como default.

**B2. `BankStatementLinesTable.tsx**` (`src/features/bank-reconciliation/components/`)

- Migrar `<table>` nativo a `DataTableV2` + `useLiftgoTable`.
- Columnas: fecha, descripción, monto, referencia, estado de conciliación.
- Conservar row-click de drill-down (patrón del proyecto).
- Sin acciones inline (V6).

**B3. `PaymentsExportTable.tsx**` (`src/features/accounts-payable/components/`)

- Migrar tabla nativa a `DataTableV2`.
- Contexto: es tabla de export/preview; usar `DataTableV2` con `pagination={false}` si se muestra completa.
- Densidad compacta (zebra + `px-3 py-2`).

**B4. `PaymentIntentsSection.tsx**` (`src/features/invoices/components/invoice-detail/`)

- Migrar `<table>` con `bg-muted/20` ad-hoc a `DataTableV2`.
- Como es sección embebida en detalle de factura, envolver en `<div className="rounded-md border">`.

**B5. Tabla de Modelos de Equipo — V2** (`src/features/settings/...` u `operations-setup`)

- Ubicar la tabla actual de Modelos dentro de `/settings/operations`.
- Migrar a `DataTableV2`, densidad estándar, eliminar la columna "Fabricante" si es única (o mostrar como agrupación).
- Alinear altura de filas al resto de la app (`py-2`).

### Fuera de alcance

- V1 (wrap de tabs de configuración) → Sprint C.
- Filtros nuevos ni servidor-side: cada tabla mantiene su dataset actual.
- Cambios de negocio/RPC.

### Detalles técnicos

- Usar `useLiftgoTable` con `data`/`sorting` locales; ninguna de estas tablas requiere paginación server-side.
- Columnas definidas con `ColumnDef<T>` tipado (sin `any`).
- Formateo monetario vía `formatCurrency` de `src/lib/money`, fechas vía helpers `es-MX`.
- Row-click → `useNavigate` cuando aplique (BankStatementLinesTable, PaymentIntentsSection).
- Verificación visual con Playwright a 1600x900 en las 4 rutas afectadas.
- Changelog: **v7.64.0** (minor — refactor de UI en 4 tablas + cierre deuda A).

### Entregable

- 4 archivos migrados + 3 archivos con deuda de Sprint A cerrada.
- Screenshots antes/después en cada tabla.
- Entrada en `public/changelog/v7.64.0.json` + índice.

¿Ejecuto Sprint B con este alcance (incluyendo el cierre de deuda de Sprint A en B1)? Si