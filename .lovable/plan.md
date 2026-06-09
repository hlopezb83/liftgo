# PR 2 — Cuentas por Pagar (UI)

Construir el módulo `/cuentas-por-pagar` sobre las tablas `supplier_bills` / `supplier_payments` ya creadas en PR 1. El módulo de Gastos Operativos se conserva intacto en este PR (se reemplazará en PR 3 junto con la migración del parser CFDI).

## Alcance

### 1. Navegación y ruta
- Nueva entrada en sidebar dentro de "Administración": **Cuentas por Pagar** (icono `FileClock`), ruta `/cuentas-por-pagar`.
- Permisos: admin, administrativo (CRUD); auditor (solo lectura). Sigue patrón `RoleGuard`.

### 2. Listado `CuentasPorPagarPage`
- KPIs arriba: Total pendiente, Vencido, Por vencer (≤7 días), Pagado mes actual — en MXN.
- Filtros: búsqueda (folio interno, folio fiscal UUID, descripción, proveedor), proveedor (select), estatus (`pending | partial | paid | overdue | cancelled | draft`), mes de emisión (default "Todos"), categoría.
- Tabla compacta zebra con columnas: Folio (CXP-XXXX), Proveedor, Emisión, Vence, Total, Saldo, Estatus (StatusBadge), Categoría.
- Drill-down lateral (Sheet) al hacer click en fila — sin columna de acciones.
- Mobile: `MobileCardList`.
- Paginación cliente 25 (`useListPage`).

### 3. Drill-down `SupplierBillDetailSheet`
- Encabezado: folio, proveedor, estatus, total, saldo destacado.
- Secciones:
  - Datos fiscales: UUID, método SAT (PUE/PPD), moneda, tipo de cambio, subtotal, IVA, retenciones.
  - Fechas: emisión, vencimiento, días restantes / días vencido.
  - Pagos aplicados: tabla con fecha, monto, método, referencia, comprobante.
  - Descripción / notas.
  - Links a XML/PDF si existen.
- Acciones (según rol): Registrar Pago, Editar, Cancelar (solo si no tiene pagos), Marcar como borrador.

### 4. Diálogos
- **`SupplierBillFormDialog`** (crear/editar manual): proveedor, categoría, descripción, emisión, vencimiento, moneda, tipo de cambio, subtotal, IVA, retenciones, total auto-calculado, UUID opcional, método SAT. Validación Zod. Para editar solo si `status` ∈ {`draft`, `pending`} y sin pagos.
- **`RegisterSupplierPaymentDialog`**: monto (pre-llenado con saldo), fecha (default hoy), método (efectivo / transferencia / cheque / tarjeta), cuenta bancaria, referencia, notas, comprobante (upload opcional). Llama RPC `register_supplier_payment`. Optimistic update + invalidate.
- **`CancelSupplierBillDialog`**: confirmación + motivo (notes).

### 5. Hooks (`src/features/accounts-payable/`)
- `useSupplierBills(filters)` — query con `suppliers(name)` joined.
- `useSupplierBill(id)` — detalle + pagos.
- `useSupplierBillMutations` — create / update / cancel.
- `useRegisterSupplierPayment` — wrapper RPC.
- `useAccountsPayableKpis` — agregados para los 4 KPIs.

### 6. Bitácora / actividad
- Registrar en `activity_feed` eventos: factura creada, pago registrado, cancelación.

### 7. Changelog
- `public/changelog.json` + `public/changelog/v6.27.0.json` (minor, "Cuentas por Pagar: módulo operativo").

## Fuera de alcance (queda para PR 3)
- Reemplazo de `/expenses` por CxP.
- Enriquecimiento de `parse-cfdi-expense` para auto-crear `supplier_bills` desde XML.
- Reporte de antigüedad (aging) y flujo de caja proyectado.
- Aprobaciones por monto / rol.
- Recurrentes.

## Estructura de archivos

```text
src/features/accounts-payable/
  pages/CuentasPorPagarPage.tsx
  components/
    SupplierBillDetailSheet.tsx
    SupplierBillFormDialog.tsx
    RegisterSupplierPaymentDialog.tsx
    CancelSupplierBillDialog.tsx
    AccountsPayableKpiCards.tsx
    AccountsPayableFilters.tsx
  hooks/
    useSupplierBills.ts
    useSupplierBill.ts
    useSupplierBillMutations.ts
    useRegisterSupplierPayment.ts
    useAccountsPayableKpis.ts
  lib/
    supplierBillConstants.ts  (labels estatus, métodos pago, categorías)
    supplierBillFilters.ts
```

## Notas técnicas
- Reutiliza `DataTableV2` + `useLiftgoTable`, `ListPageLayout`, `useDialogState`, `SearchBar`, `StatusBadge`, `formatCurrency`, `nowMty`, `toYMD`.
- Estatus `overdue` se calcula vía trigger DB pero se reverifica visualmente comparando `due_date < hoy` y `balance > 0`.
- Subida de comprobante: bucket `supplier-payment-receipts` (privado) — si no existe se crea en migración pequeña dentro del PR.
- Sin tocar `operating_expenses` ni `parse-cfdi-expense`.
- Tests mínimos: `useAccountsPayableKpis` cálculo, `RegisterSupplierPaymentDialog` validación (no permite monto > saldo).
